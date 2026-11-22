mod support;
use europacss::{compile, compile_frontend};
use serde_json::{json, Value};
use support::{assert_css, config, request};

fn colors() -> Value {
    let mut cfg = config();
    cfg["theme"]["breakpointCollections"]["$desktop"] = "desktop".into();
    cfg["theme"]["colors"] = json!({"green":{"dark":"#22AA22", "light":"#AAFFAA", "test":{"one":"#ffffff", "two":"#000000"}}, "gray":{"100":"#111111", "200":"#222222"}});
    cfg
}

#[test]
fn color_token_paths_numeric_keys_literal_keys_and_important_variants() {
    for (fg, bg, expected_fg, expected_bg) in [
        ("green.dark", "green.light", "#22AA22", "#AAFFAA"),
        ("gray.100", "gray.200", "#111111", "#222222"),
        ("green.test.one", "green.test.two", "#ffffff", "#000000"),
        ("green/dark", "green/light", "#22AA22", "#AAFFAA"),
        ("green/test/one", "green/test/two", "#ffffff", "#000000"),
        ("gray/100", "gray/200", "#111111", "#222222"),
    ] {
        for (directive, important) in [("color", ""), ("color!", " !important")] {
            assert_css(&format!("article{{@{directive} fg {fg}; @{directive} bg {bg};}}"),
                &format!("article{{color:{expected_fg}{important};background-color:{expected_bg}{important};}}"), colors());
        }
    }
    let mut cfg = colors();
    cfg["theme"]["colors"]["green/dark"] = "purple".into();
    assert_css(
        "article{@color fg green/dark;}",
        "article{color:purple}",
        cfg,
    );
}

#[test]
fn color_queries_and_native_value_functions_keep_their_use_site() {
    for (query, media) in [
        ("desktop", "(width >= 1024px)"),
        ("$lg", "(width >= 1024px)"),
        ("$sm", "(width < 1024px)"),
        (">=tablet", "(width >= 740px)"),
        ("<=tablet", "(width < 1024px)"),
        ("mobile/desktop", "(width < 740px), (width >= 1024px)"),
    ] {
        for important in ["", "!"] {
            let suffix = if important.is_empty() {
                ""
            } else {
                "!important"
            };
            assert_css(
                &format!("article{{@color{important} fg green.dark {query}; color:blue;}}"),
                &format!("article{{@media {media}{{color:#22AA22 {suffix};}} color:blue;}}"),
                colors(),
            );
        }
    }
    assert_css(
        "article{@responsive $desktop {@color fg green.test.one;@color bg green.test.two;}}",
        "article{@media (width >= 1024px){color:white;background-color:black}}",
        colors(),
    );
    for value in [
        "var(--baseColor3)",
        "var(--color, #22AA22)",
        "var(--color, var(--fallback, rgb(1, 2, 3)))",
        "rgb(20 30 40 / 50%)",
        "hsl(120 20% 50%)",
        "color-mix(in srgb, red 25%, blue)",
    ] {
        assert_css(&format!("article{{@color fg {value};@color! bg {value} desktop;}}"), &format!("article{{color:{value};@media (width >= 1024px){{background-color:{value}!important;}}}}"), colors());
    }
}

#[test]
fn every_color_target_expands_inside_nested_conditional_scopes() {
    for (alias, property) in [
        ("fg", "color"),
        ("bg", "background-color"),
        ("fill", "fill"),
        ("stroke", "stroke"),
        ("border", "border-color"),
        ("border-top", "border-top-color"),
        ("border-right", "border-right-color"),
        ("border-bottom", "border-bottom-color"),
        ("border-left", "border-left-color"),
    ] {
        assert_css(&format!("@layer ui {{ @supports (display:grid) {{ .card {{ &:hover {{ @color {alias} green.dark; }} }} }} }}"), &format!("@layer ui {{ @supports (display:grid) {{ .card {{ &:hover {{ {property}:#22AA22; }} }} }} }}"), colors());
    }
}

#[test]
fn display_and_order_cover_legacy_parent_and_responsive_positions() {
    for (directive, declarations) in [
        ("@display flex;", "display:flex;"),
        ("@order 1;", "order:1;"),
    ] {
        for (prefix, suffix, expected_prefix, expected_suffix) in [
            ("article{", "}", "article{", "}"),
            (
                "article{@responsive mobile{",
                "}}",
                "article{@media (width < 740px){",
                "}}",
            ),
            (
                ".inner{article{@responsive mobile{",
                "}}}",
                ".inner{article{@media (width < 740px){",
                "}}}",
            ),
            (
                ".inner{article{@responsive mobile{figure{",
                "}}}}",
                ".inner{article{@media (width < 740px){figure{",
                "}}}}",
            ),
        ] {
            assert_css(
                &format!("{prefix}{directive}{suffix}"),
                &format!("{expected_prefix}{declarations}{expected_suffix}"),
                config(),
            );
        }
    }
    assert_css(
        ".inner{article{@order 1 $lg;}}",
        ".inner{article{@media (width >= 1024px){order:1}}}",
        config(),
    );
    for (shorthand, expected) in [
        ("flex", "display:flex"),
        ("flex/row", "display:flex;flex-direction:row"),
        (
            "flex/row/wrap",
            "display:flex;flex-direction:row;flex-wrap:wrap",
        ),
        (
            "inline-flex/column-reverse/wrap-reverse",
            "display:inline-flex;flex-direction:column-reverse;flex-wrap:wrap-reverse",
        ),
    ] {
        assert_css(
            &format!(".inner{{article{{@display {shorthand} $lg;}}}}"),
            &format!(".inner{{article{{@media (width >= 1024px){{{expected}}}}}}}"),
            config(),
        );
    }
    assert_css(".inner{article{@display flex/row/wrap $lg;@display flex/column/nowrap mobile;}}", ".inner{article{@media (width >= 1024px){display:flex;flex-direction:row;flex-wrap:wrap}@media (width < 740px){display:flex;flex-direction:column;flex-wrap:nowrap}}}", config());
}

#[test]
fn later_authored_display_order_and_color_declarations_win() {
    assert_css(
        ".x{@display flex;display:grid;@order -2;order:3;@color fg red;color:blue;}",
        ".x{display:grid;order:3;color:blue}",
        config(),
    );
    // In-place expansion also preserves overrides authored before a directive.
    assert_css(
        ".x{display:grid;@display flex;order:3;@order -2;color:blue;@color fg red;}",
        ".x{display:flex;order:-2;color:red}",
        config(),
    );
}

#[test]
fn basic_directives_reject_bad_context_arguments_and_config_types() {
    for source in [
        "@color fg red;",
        "@display flex;",
        "@order 1;",
        ".x{@color;}",
        ".x{@color invalid red;}",
        ".x{@color fg red {color:blue;}}",
        ".x{@display;}",
        ".x{@display flex//wrap;}",
        ".x{@display flex/row/wrap/extra;}",
        ".x{@order;}",
        ".x{@order 1 {color:red;}}",
        ".x{@responsive desktop{@color fg red desktop;}}",
        ".x{@responsive desktop{.child{@order 1 mobile;}}}",
    ] {
        assert!(compile(&request(source, config())).is_err(), "{source}");
    }
    assert_eq!(
        compile(&request(".x{@color fg green;}", colors()))
            .unwrap_err()
            .code,
        "EU_CONFIG"
    );
}

#[test]
fn if_covers_root_style_and_nested_boolean_branches_in_place() {
    for enabled in [false, true] {
        let mut cfg = config();
        cfg["theme"]["typography"] = json!({"optimizeLegibility":enabled});
        let decls = "text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;";
        assert_css(
            &format!("article{{@if theme.typography.optimizeLegibility {{{decls}}}}}"),
            &format!("article{{{}}}", if enabled { decls } else { "" }),
            cfg.clone(),
        );
        assert_css(
            &format!("@if theme.typography.optimizeLegibility {{article{{{decls}}}}}"),
            &format!("article{{{}}}", if enabled { decls } else { "" }),
            cfg,
        );
    }
    let mut cfg = config();
    cfg["features"] = json!({"on":true,"off":false});
    assert_css("@layer ui {.x{color:blue;@if features.on {color:red;@if features.off {@font nonexistent;} } color:green;}}", "@layer ui {.x{color:blue;color:red;color:green;}}", cfg.clone());
    for source in [
        "@if features.on;",
        ".x{@if missing{color:red}}",
        ".x{@if {color:red}}",
    ] {
        assert!(compile(&request(source, cfg.clone())).is_err(), "{source}");
    }
    for (value, enabled) in [
        (json!(false), false),
        (json!(0), false),
        (json!(""), false),
        (Value::Null, false),
        (json!(true), true),
        (json!(-1), true),
        (json!("false"), true),
        (json!([]), true),
        (json!({}), true),
    ] {
        cfg["features"]["on"] = value;
        assert_css(
            ".x{@if features.on{color:red}}",
            if enabled { ".x{color:red}" } else { ".x{}" },
            cfg.clone(),
        );
    }
}

#[test]
fn configuration_values_cannot_introduce_extra_declarations_or_rules() {
    for value in ["red;opacity:0", "red; @unknown foo"] {
        let mut cfg = colors();
        cfg["theme"]["colors"]["bad"] = value.into();
        let error = compile_frontend(&request(".card {\n @color fg bad;\n}", cfg)).unwrap_err();
        assert_eq!(error.code, "EU_DECLARATION");
        assert_eq!((error.line, error.column), (2, 2));
    }
    // Component blocks and quoted semicolons are still legitimate values.
    assert_css(
        ".x {--tokens:{a:b;c:d};content:'a;b';}",
        ".x {--tokens:{a:b;c:d};content:'a;b';}",
        config(),
    );
}
