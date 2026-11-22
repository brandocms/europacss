mod support;
use europacss::{compile, compile_frontend};
use serde_json::json;
use support::{assert_css, config, request};

#[test]
fn theme_values_work_in_declarations_directives_and_conditional_preludes() {
    let mut cfg = config();
    cfg["theme"]["colors"] =
        json!({"red":"#ff0000", "nested":{"blue":"blue"}, "literal/slash":"green"});
    cfg["theme"]["gap"] = json!("20px");
    assert_css(".x {color:theme(colors.red);@space margin-top theme(gap);@color bg theme('colors.nested.blue');outline-color:theme(\"colors.literal/slash\");} @media (min-width:theme(breakpoints.tablet)) {.x {display:none}}", ".x {color:red;margin-top:20px;background-color:blue;outline-color:green} @media (min-width:740px) {.x {display:none}}", cfg);
}

#[test]
fn theme_arrays_fallbacks_and_nested_values_keep_css_components_intact() {
    let mut cfg = config();
    cfg["theme"]["families"] = json!(["Inter", "serif"]);
    cfg["theme"]["brand"] = json!("theme(colors.red, rgb(10, 20, 30))");
    assert_css(".x {font-family:theme(families);color:theme(brand);box-shadow:theme(missing, 0 0 1px red, 0 0 2px blue);width:calc((theme(missing, 20px)) + 10px)}", ".x {font-family:Inter,serif;color:rgb(10,20,30);box-shadow:0 0 1px red, 0 0 2px blue;width:30px}", cfg.clone());
    // A fallback is evaluated only if the first lookup is missing.
    assert_css(
        ".x {font-family:theme(families, theme(missing))}",
        ".x {font-family:Inter,serif}",
        cfg,
    );
}

#[test]
fn all_legacy_easing_curves_and_aliases_are_available() {
    // The table was copied from the legacy JavaScript at tag 1.0.0-beta.16.
    let reference = include_str!("fixtures/legacy-easings.txt");
    let mut count = 0;
    for line in reference.lines().filter(|l| l.contains(": 'cubic-bezier(")) {
        let (key, value) = line.trim().split_once(": '").unwrap();
        let name = key.trim_matches('\'');
        let curve = value.trim_end_matches(',').trim_end_matches('\'');
        assert_css(
            &format!(".x {{transition:all 300ms ease('{name}')}}"),
            &format!(".x {{transition:all 300ms {curve}}}"),
            config(),
        );
        count += 1;
    }
    assert_eq!(count, 40);
    assert_css(
        ".x {animation-timing-function:ease()}",
        ".x {animation-timing-function:cubic-bezier(.25,.1,.25,1)}",
        config(),
    );
}

#[test]
fn value_functions_do_not_rewrite_strings_comments_urls_or_selectors() {
    let source = r#".theme {content:'theme(missing) ease(nope)'; --image:url('theme(missing).svg'); /* theme(missing) */}"#;
    let output = compile_frontend(&request(source, config())).unwrap().css;
    assert!(output.contains("'theme(missing) ease(nope)'"));
    assert!(output.contains("url('theme(missing).svg')"));
    assert!(output.contains("/* theme(missing) */"));
}

#[test]
fn function_errors_keep_authored_locations_and_reject_ambiguous_values() {
    let mut cfg = config();
    cfg["theme"]["cycle"] = json!("theme(cycle)");
    cfg["theme"]["bad"] = json!("red; width:0");
    for expression in [
        "theme(missing)",
        "theme(breakpoints)",
        "theme()",
        "theme(cycle)",
        "theme(bad)",
        "ease(nope)",
        "ease(sine.in, sine.out)",
    ] {
        let source = format!(".x {{\n color:{expression};\n}}");
        let error = compile(&request(&source, cfg.clone())).unwrap_err();
        assert_eq!(
            (error.code.as_str(), error.line),
            ("EU_FUNCTION", 2),
            "{expression}: {error}"
        );
    }
}
