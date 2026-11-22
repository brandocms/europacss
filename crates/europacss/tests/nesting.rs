mod support;
use europacss::{compile, compile_frontend, migration};
use serde_json::json;
use support::{assert_css, config, request};

#[test]
fn expanded_selectors_keep_per_branch_specificity_and_same_parent_matching() {
    let mut cfg = config();
    cfg["nesting"] = json!("expanded");
    let source = ".a,#b{color:red;&:hover{color:blue}& + &{color:green}}";
    assert_css(
        source,
        ".a,#b{color:red}.a:hover,#b:hover{color:blue}.a + .a,#b + #b{color:green}",
        cfg.clone(),
    );
    let req = request(source, cfg.clone());
    let front = compile_frontend(&req).unwrap().css;
    assert!(front.contains(".a:hover, #b:hover"), "{front}");
    assert!(front.contains(".a + .a, #b + #b"), "{front}");
    assert!(!front.contains(":is("));
    for target in ["chrome 100", "chrome 131"] {
        let mut req = request(source, cfg.clone());
        req.browsers = vec![target.into()];
        let output = compile(&req).unwrap();
        assert!(!output.css.contains(":is("), "{}", output.css);
    }
    let report = migration::analyze(&req, migration::LEGACY_BETA6).unwrap();
    assert!(report.analysis_complete, "{report:?}");
    assert!(!report.findings.iter().any(|f| matches!(
        f.diagnostic.code.as_str(),
        "EU_MIGRATION_SPECIFICITY" | "EU_MIGRATION_MATCHING"
    )));
    let native = compile(&request(source, config())).unwrap().css;
    assert!(native.contains(":is("));
}

#[test]
fn expanded_nesting_preserves_conditions_pseudo_elements_and_declaration_order() {
    let mut cfg = config();
    cfg["nesting"] = json!("expanded");
    let source = "@layer ui{.a::before,.b::after{color:red;@supports(display:grid){&{display:grid}}color:green;@media print{color:blue}}}";
    let output = compile_frontend(&request(source, cfg)).unwrap().css;
    assert!(output.contains(".a::before, .b::after"));
    assert!(output.contains("@layer ui"));
    assert!(output.contains("@supports"));
    assert!(output.find("color:red").unwrap() < output.find("color:green").unwrap());
    assert!(output.find("color:green").unwrap() < output.find("color:blue").unwrap());
}

#[test]
fn expanded_nesting_refuses_excessive_expansion_instead_of_changing_semantics() {
    let mut cfg = config();
    cfg["nesting"] = json!("expanded");
    let selectors = (0..20)
        .map(|i| format!(".p{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let error = compile(&request(
        &format!("{selectors}{{{selectors}{{color:red}}}}"),
        cfg,
    ))
    .unwrap_err();
    assert_eq!(error.code, "EU_NESTING_LIMIT");
}
