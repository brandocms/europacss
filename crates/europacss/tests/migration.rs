mod support;
use europacss::migration::{self, LEGACY_VERSION};
use serde_json::json;
use support::{assert_css, config, request};

fn analyze(source: &str) -> migration::Report {
    migration::analyze(&request(source, config()), LEGACY_VERSION).unwrap()
}

#[test]
fn specificity_reports_actual_branch_changes_including_class_only_lists() {
    for (source, old, new) in [
        (".card, #featured {.title{color:red}}", "(0,2,0)", "(1,1,0)"),
        (
            ".card, .card.active {&:hover{color:red}}",
            "(0,2,0)",
            "(0,3,0)",
        ),
        (
            ".a, #b {:nth-child(2n of &){color:red}}",
            "(0,2,0)",
            "(1,1,0)",
        ),
        (".a, #b {& + &{color:red}}", "(0,2,0)", "(2,0,0)"),
    ] {
        let report = analyze(source);
        assert!(report.analysis_complete, "{report:?}");
        let findings: Vec<_> = report
            .findings
            .iter()
            .filter(|f| f.diagnostic.code == "EU_MIGRATION_SPECIFICITY")
            .collect();
        assert_eq!(findings.len(), 1, "{report:?}");
        assert!(findings[0].diagnostic.message.contains(old), "{report:?}");
        assert!(findings[0].diagnostic.message.contains(new), "{report:?}");
        assert!(findings[0].fix.is_none());
    }
}

#[test]
fn equal_specificity_where_and_declaration_only_conditions_do_not_warn() {
    for source in [
        ".a, .b {.title{color:red}}",
        ".a, #b {color:red;@responsive mobile{color:blue}}",
        ".a, #b {:where(&){color:red}}",
        ".a, #b {:is(&, #dominant){color:red}}",
        ".a, #b {:not(&, #dominant){color:red}}",
        ".a, #b {:has(&, #dominant){color:red}}",
        ".a[data-x='&'], .b:is(.x,.y) {color:red}",
        ".a { [data-x='&'] {color:red}}",
    ] {
        let report = analyze(source);
        assert!(report.findings.is_empty(), "{source}: {report:?}");
        assert!(report.analysis_complete);
    }
}

#[test]
fn nested_specificity_is_propagated_through_conditions_and_multiple_levels() {
    let report = analyze(".a, #b { @supports(display:grid){.child{.grandchild{color:red}}}} ");
    assert_eq!(report.findings.len(), 2, "{report:?}");
    assert!(report
        .findings
        .iter()
        .any(|f| f.diagnostic.message.contains("(0,3,0) to (1,2,0)")));
    let report = analyze(".a::before{&:hover{color:red}}");
    assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_MATCHING");
    assert!(!report.analysis_complete);
}

#[test]
fn generated_selectors_are_analyzed_with_the_actual_configuration() {
    let mut cfg = config();
    cfg["theme"]["variants"] = json!({"danger":"red"});
    let report = migration::analyze(
        &request(
            ".a, #b {@iterate theme.variants {&.$key{color:$value}}}",
            cfg,
        ),
        LEGACY_VERSION,
    )
    .unwrap();
    assert!(report.analysis_complete, "{report:?}");
    assert_eq!(report.findings.len(), 1);
    assert!(report.findings[0].diagnostic.message.contains(".danger"));
}

#[test]
fn syntax_autofix_flattens_suffixes_in_order_inside_existing_scopes() {
    let source = "/* keep */ @layer ui {@supports(display:grid){.card {color:red;/* title */ &__title{color:blue;&-large{font-size:30px}}color:green;@media print{&__print{color:black}}}}} .after{color:purple}";
    let report = analyze(source);
    let edits: Vec<_> = report
        .findings
        .iter()
        .filter_map(|f| f.fix.as_ref())
        .flat_map(|f| f.edits.clone())
        .collect();
    assert_eq!(report.findings.len(), 3, "{report:?}");
    assert!(!edits.is_empty());
    let fixed = migration::apply_edits(source, "rule.css", &edits).unwrap();
    assert!(fixed.contains("/* keep */"));
    assert!(fixed.contains("/* title */"));
    assert!(analyze(&fixed).findings.is_empty(), "{fixed}");
    let expected = "/* keep */ @layer ui {@supports(display:grid){.card{color:red;/* title */}.card__title{color:blue}.card__title-large{font-size:30px}.card{color:green}@media print{.card__print{color:black}}}} .after{color:purple}";
    assert_css(&fixed, expected, config());
    assert_eq!(
        migration::apply_edits(&fixed, "rule.css", &[]).unwrap(),
        fixed
    );
}

#[test]
fn suffix_fixes_decline_complex_or_generated_contexts() {
    for source in [
        ".card:hover{&__title{color:red}}",
        ".card,.other{&__title{color:red}}",
        ".outer{.card{&__title{color:red}}}",
        ".card{@space padding 20px;&__title{color:red}}",
        "%placeholder{&__title{color:red}} .card{@extend %placeholder;}",
    ] {
        let report = analyze(source);
        assert!(
            report
                .findings
                .iter()
                .any(|f| f.diagnostic.code == "EU_MIGRATION_SUFFIX"),
            "{report:?}"
        );
        assert!(
            report.findings.iter().all(|f| f.fix.is_none()),
            "{report:?}"
        );
    }
}

#[test]
fn unknown_versions_limits_and_transform_failures_cannot_look_clean() {
    let req = request(".x{color:red}", config());
    assert_eq!(
        migration::analyze(&req, "1.0.0").unwrap_err().code,
        "EU_MIGRATION_VERSION"
    );
    let parents = (0..20)
        .map(|i| format!(".p{i}"))
        .collect::<Vec<_>>()
        .join(",");
    for source in [
        format!("{parents}{{{parents}{{color:red}}}}"),
        ".x{@fontsize missing;}".into(),
        "@scope(.x){.a,.b{color:red}}".into(),
    ] {
        let report = analyze(&source);
        assert!(!report.analysis_complete, "{report:?}");
        assert!(report
            .findings
            .iter()
            .any(|f| f.diagnostic.code == "EU_MIGRATION_INCOMPLETE"));
    }
}

#[test]
fn base_properties_and_responsive_fallbacks_report_concrete_order_changes() {
    let mut cfg = config();
    cfg["theme"]["typography"]["sizes"] =
        json!({"base":{"__base__":{"line-height":"150%"},"*":"20px"}});
    let report = migration::analyze(
        &request("body{\n @fontsize base;\n line-height:normal;\n}", cfg),
        LEGACY_VERSION,
    )
    .unwrap();
    assert_eq!(report.findings.len(), 1, "{report:?}");
    assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_ORDER");
    assert_eq!(report.findings[0].diagnostic.line, 3);
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("line-height: 150%"));
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("line-height: normal"));
    assert!(
        report.findings[0].fix.is_none(),
        "Accepting corrected authored order is not an automatic edit"
    );
    let report = analyze(".button{@space height 50px desktop;height:40px}");
    assert_eq!(report.findings.len(), 1, "{report:?}");
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("height: 50px"));
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("height: 40px"));
}

#[test]
fn order_analysis_understands_shorthands_importance_and_unrelated_properties() {
    for source in [
        ".x{@space margin-left 20px desktop;margin:0}",
        ".x{@space! margin-left 20px desktop;margin:0!important}",
        ".x{@space margin-left 20px desktop;all:unset}",
    ] {
        assert!(
            analyze(source)
                .findings
                .iter()
                .any(|f| f.diagnostic.code == "EU_MIGRATION_ORDER"),
            "{source}"
        );
    }
    for source in [
        ".x{@space margin-left 20px desktop;color:red}",
        ".x{@space margin-left 20px desktop;margin:0!important}",
        ".x{@space! margin-left 20px desktop;margin:0}",
        ".x{margin:0;@space margin-left 20px desktop;}",
        ".x{@space margin-left 20px desktop;margin-left:20px}",
        ".x{@media print{--x:10px}all:unset}",
        ".x{@space margin-left 20px desktop;.child{margin:0}}",
    ] {
        assert!(
            analyze(source).findings.is_empty(),
            "{source}: {:?}",
            analyze(source)
        );
    }
}

#[test]
fn fixes_reject_stale_or_overlapping_source_snapshots() {
    let source = ".card{&__title{color:red}}";
    let report = analyze(source);
    let edits = &report.findings[0].fix.as_ref().unwrap().edits;
    assert!(migration::apply_edits(&source.replace("red", "tan"), "rule.css", edits).is_err());
    let mut overlapping = edits.clone();
    let mut other = edits[0].clone();
    other.replacement.push(' ');
    overlapping.push(other);
    assert!(migration::apply_edits(source, "rule.css", &overlapping).is_err());
}

#[test]
fn generated_suffixes_and_legacy_nest_are_never_silently_accepted() {
    let mut cfg = config();
    cfg["theme"]["variants"] = json!({"__title":"red"});
    let report = migration::analyze(
        &request(".card{@iterate theme.variants {&$key{color:$value}}}", cfg),
        LEGACY_VERSION,
    )
    .unwrap();
    assert!(report
        .findings
        .iter()
        .any(|f| f.diagnostic.code == "EU_MIGRATION_SUFFIX"));
    let report = analyze(".card{@nest .parent & {color:red}} ");
    assert!(report
        .findings
        .iter()
        .any(|f| f.diagnostic.code == "EU_MIGRATION_NEST"));
    assert!(!report.analysis_complete);
}

#[test]
fn repeated_ampersands_can_change_matching_without_changing_specificity() {
    let report = analyze(".a,.b{& + &{color:red}}");
    assert_eq!(report.findings.len(), 1, "{report:?}");
    assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_MATCHING");
    for source in [
        ".a,.b{&&{color:red}}",
        ".a,.b{&[data-x=' ']&{color:red}}",
        ".a,.b{:is(&,&){color:red}}",
    ] {
        assert!(analyze(source).findings.is_empty(), "{source}");
    }
}
