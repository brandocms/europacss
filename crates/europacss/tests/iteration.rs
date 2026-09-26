mod support;
use europacss::{compile, compile_frontend};
use serde_json::json;
use support::{assert_css, config, request};

// Ported from __tests__/rules/substituteIterateAtRules.test.js.
#[test]
fn iterates_breakpoint_values_with_and_without_surrounding_declarations() {
    let mut cfg = config();
    cfg["theme"]["spacing"] = json!({"md":{"mobile":"25px","tablet":"50px","desktop":"75px"}});
    for prefix in ["", "margin-top:100px;"] {
        assert_css(
            &format!("article {{ {prefix} @iterate theme.spacing.md {{ @responsive $key {{margin-bottom:$value}} }} }}"),
            &format!("article {{ {prefix} @media (width < 740px) {{margin-bottom:25px}} @media (width >= 740px) and (width < 1024px) {{margin-bottom:50px}} @media (width >= 1024px) {{margin-bottom:75px}} }}"),
            cfg.clone(),
        );
    }
}

#[test]
fn iterates_custom_property_names_using_dot_and_slash_paths() {
    for path in ["theme.breakpoints", "theme/breakpoints"] {
        assert_css(
            &format!(":root {{ @iterate {path} {{ --breakpoint-$key: $value }} }}"),
            ":root {--breakpoint-mobile:0;--breakpoint-tablet:740px;--breakpoint-desktop:1024px}",
            config(),
        );
    }
}

#[test]
fn interpolates_quoted_keys_inside_nested_rules() {
    assert_css(
        "i.dbg { position:fixed; &:after { text-align:center; @iterate theme.breakpoints { @responsive $key { content:'$key'; } } } }",
        "i.dbg {position:fixed; &:after {text-align:center; @media (width < 740px) {content:'mobile'} @media (width >= 740px) and (width < 1024px) {content:'tablet'} @media (width >= 1024px) {content:'desktop'}}}",
        config(),
    );
}

#[test]
fn replacements_are_complete_scoped_and_do_not_reinterpret_inserted_text() {
    let mut cfg = config();
    cfg["outer"] = json!({"a": {"x":1, "y":2}, "b":{"z":3}});
    cfg["values"] = json!([true, "$key", 0]);
    assert_css(
        ".x { @iterate outer { --outer-$key: '$key'; @iterate outer.$key { --inner-$key: $value $value; } --after-$key: '$key'; } @iterate values { --value-$key: '$value'; } }",
        ".x {--outer-a:'a';--inner-x:1 1;--inner-y:2 2;--after-a:'a';--outer-b:'b';--inner-z:3 3;--after-b:'b';--value-0:'true';--value-1:'$key';--value-2:'0'}",
        cfg,
    );
}

#[test]
fn generated_rules_keep_native_specificity_scope_and_source_order() {
    let mut cfg = config();
    cfg["palette"] = json!({"hot":"red", "cold":"blue"});
    assert_css(
        "@layer components {@supports (display:grid) {.card,#featured { @iterate palette { &.$key {color:$value} } color:green; }}}",
        "@layer components {@supports (display:grid) {:is(.card,#featured).hot {color:red} :is(.card,#featured).cold {color:blue} .card,#featured {color:green}}}",
        cfg.clone(),
    );
    assert_css(
        ".x {@iterate palette {color:$value} color:green}",
        ".x {color:green}",
        cfg,
    );
}

#[test]
fn generated_directives_and_placeholders_are_expanded() {
    let mut cfg = config();
    cfg["palette"] = json!({"red":"red","blue":"blue"});
    assert_css(
        "%paint {@color fg $value;} .x {@iterate palette {@extend %paint; --name-$key:'$key'}}",
        ".x {color:red;--name-red:'red';color:blue;--name-blue:'blue'}",
        cfg,
    );
}

#[test]
fn invalid_iteration_shapes_report_the_authored_location() {
    let mut cfg = config();
    cfg["bad"] = json!("red");
    cfg["nested"] = json!({"x":{"value":1}});
    for (rule, code) in [
        ("@iterate;", "EU_ARGUMENTS"),
        ("@iterate {}", "EU_ARGUMENTS"),
        ("@iterate theme.breakpoints;", "EU_ARGUMENTS"),
        ("@iterate missing {}", "EU_CONFIG"),
        ("@iterate bad {}", "EU_ITERATE"),
        ("@iterate nested {color:$value}", "EU_ITERATE"),
    ] {
        let source = format!("/* 🙂 */\r\n.x {{\r\n  {rule}\r\n}}");
        let error = compile(&request(&source, cfg.clone())).unwrap_err();
        assert_eq!(error.code, code, "{rule}: {error}");
        assert_eq!(error.line, 3, "{rule}: {error}");
    }
    assert_eq!(
        compile(&request("@iterate theme.breakpoints {}", cfg))
            .unwrap_err()
            .code,
        "EU_CONTEXT"
    );
}

#[test]
fn substitution_cannot_inject_extra_css_nodes() {
    for value in ["red; width:0", "red;} .injected {color:blue", "red /*"] {
        let mut cfg = config();
        cfg["values"] = json!([value]);
        let error = compile(&request(".x {@iterate values {color:$value}}", cfg)).unwrap_err();
        assert_eq!(error.code, "EU_ITERATE", "{value}: {error}");
    }
}

#[test]
fn nested_expansion_and_even_empty_iterations_are_bounded() {
    let mut cfg = config();
    cfg["many"] = json!((0..1001).collect::<Vec<_>>());
    let error =
        compile_frontend(&request(".x {@iterate many {@iterate many {}}}", cfg)).unwrap_err();
    assert_eq!(error.code, "EU_LIMIT");
}

#[test]
fn repeated_compiles_do_not_retain_iterator_bindings() {
    let req = request(
        ":root {@iterate theme.breakpoints {--$key:$value}}",
        config(),
    );
    assert_eq!(compile(&req).unwrap().css, compile(&req).unwrap().css);
}

#[test]
fn diagnostics_after_long_unicode_substitution_stay_on_the_source_selector() {
    let mut cfg = config();
    cfg["names"] = json!(["café".repeat(100)]);
    let source = ".x {\n @iterate names {\n  &$value, &__title { color:red }\n }\n}";
    let error = compile(&request(source, cfg)).unwrap_err();
    assert_eq!(
        (error.code.as_str(), error.line, error.column),
        ("EU_LEGACY_SUFFIX", 3, 3)
    );
}

#[test]
fn unpacked_config_data_is_not_interpolated_again() {
    let mut cfg = config();
    cfg["groups"] = json!({"first":{"mobile":{"content":"'$value'"}}});
    assert_css(
        ".x {@iterate groups {@unpack groups.$key}}",
        ".x {@media (width < 740px) {content:'$value'}}",
        cfg,
    );
}
