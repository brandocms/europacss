use europacss::{
    compile_frontend as compile,
    parser::{arguments, parse},
    Request,
};
use serde_json::json;

fn request(source: &str) -> Request {
    Request {
        source: source.into(),
        filename: "fixture.css".into(),
        source_map: true,
        config: json!({
            "enabled": true,
            "theme": {
                "breakpoints": { "desktop": "1024px", "mobile": "0", "tablet": "740px" },
                "breakpointCollections": { "$sm": "mobile/tablet", "$lg": "desktop" },
                "colors": { "brand": { "dark": "#123456" } },
                "spacing": { "md": { "mobile": "10px", "tablet": "20px", "desktop": "30px" } }
            }
        }),
        ..Request::default()
    }
}

#[test]
fn parses_europa_and_opaque_css_values() {
    let nodes = parse(r#".café { --breakpoint-$key: {x: [1; 2]}; content: "};\""; background: url(data:image/svg+xml;base64,ab==); @color! fg var(--x, rgb(1, 2, 3)) $lg; }"#).unwrap();
    let children = nodes[0].children.as_ref().unwrap();
    assert_eq!(children.len(), 4);
    assert_eq!(children[0].text, "--breakpoint-$key: {x: [1; 2]}");
    assert_eq!(children[3].at_rule().unwrap().0, "color!");
}

#[test]
fn tokenizes_preludes_without_css_property_grammar() {
    assert_eq!(
        arguments("fg colors.darkBlue $desktop").unwrap(),
        ["fg", "colors.darkBlue", "$desktop"]
    );
    assert_eq!(
        arguments("fg/**/var(--x, rgb(1, 2, 3)) $desktop").unwrap(),
        ["fg", "var(--x, rgb(1, 2, 3))", "$desktop"]
    );
    assert_eq!(
        arguments("header/large/1.2 300px->800px").unwrap(),
        ["header/large/1.2", "300px->800px"]
    );
}

#[test]
fn rejects_malformed_or_excessively_nested_input_without_panicking() {
    for css in [
        "}",
        ".x {",
        ".x {color: var(--x]}",
        ".x { content: 'bad\n' }",
        "/*",
        ".x { x: \\",
    ] {
        assert!(parse(css).is_err(), "{css}");
    }
    assert!(parse(&format!("{}{}", ".x {".repeat(150), "}".repeat(150))).is_err());
}

#[test]
fn source_order_and_conditional_scopes_are_preserved() {
    let out = compile(&request("@layer components { @supports (display: grid) { .x { @color fg brand.dark; color: blue; @responsive $lg { @display grid; } color: green; } } }")).unwrap();
    assert!(out
        .css
        .starts_with("@layer components {\n@supports (display: grid) {\n.x {"));
    assert!(out.css.find("color: #123456").unwrap() < out.css.find("color: blue").unwrap());
    assert!(
        out.css.find("@media (width >= 1024px)").unwrap() < out.css.find("color: green").unwrap()
    );
}

#[test]
fn breakpoint_queries_are_validated_and_sorted_by_width() {
    for (query, expected) in [
        ("$sm", "(width <= 1023px)"),
        (">=tablet", "(width >= 740px)"),
        ("mobile/desktop", "(width <= 739px), (width >= 1024px)"),
        ("300px->800px", "(width >= 300px) and (width <= 800px)"),
        ("<mobile", "not all"),
    ] {
        let out = compile(&request(&format!(
            ".x {{ @responsive {query} {{ color: red }} }}"
        )))
        .unwrap();
        assert!(out.css.contains(expected), "{}", out.css);
    }
    let err = compile(&request(".x { @responsive mystery {color:red} }")).unwrap_err();
    assert_eq!(err.code, "EU_BREAKPOINT");
    let mut req = request(".x { @responsive $loop {color:red} }");
    req.config["theme"]["breakpointCollections"]["$loop"] = json!("$loop");
    assert!(compile(&req).unwrap_err().message.contains("Cyclic"));
}

#[test]
fn expands_named_spacing_in_place() {
    let out = compile(&request(
        ".x { @space! padding-x md $sm; padding-left: 99px; }",
    ))
    .unwrap();
    assert!(out.css.contains("padding-left: 10px !important"));
    assert!(out.css.contains("padding-right: 20px !important"));
    assert!(!out.css.contains("30px"));
    assert!(out.css.rfind("padding-left: 99px").unwrap() > out.css.rfind("!important").unwrap());
}

#[test]
fn placeholder_forward_references_expand_at_use_site() {
    let out = compile(&request(".button { color: red; @extend %button; color: blue; } %button { @color fg brand.dark; &:hover { color: green } }")).unwrap();
    assert!(!out.css.contains('%'));
    assert!(out.css.find("color: red").unwrap() < out.css.find("color: #123456").unwrap());
    assert!(out.css.contains("&:hover"));
    assert!(compile(&request(
        "%a { @extend %b; } %b { @extend %a; } .x { @extend %a; }"
    ))
    .unwrap_err()
    .message
    .contains("Cyclic"));
    assert_eq!(
        compile(&request(".x { @extend .y; }")).unwrap_err().code,
        "EU_EXTEND"
    );
}

#[test]
fn multiple_placeholders_expand_in_list_order_and_retain_scope() {
    let out = compile(&request("%first{color:red} %second{color:blue;&:hover{color:green}} .x{@responsive tablet{@extend %first, /* next */ %second; color:black}}" )).unwrap();
    assert!(out.css.contains("color:red"), "{}", out.css);
    assert!(out.css.find("color:red").unwrap() < out.css.find("color:blue").unwrap());
    assert!(out.css.find("color:blue").unwrap() < out.css.find("color:black").unwrap());
    assert!(out.css.contains("@media"));
    for source in [
        "%a{color:red}.x{@extend %a,}",
        "%a{color:red}.x{@extend ,%a}",
        "%a{color:red}.x{@extend %a .other}",
        "%a{color:red}.x{@extend %a,.other}",
        "%a{@extend %b,%a}%b{color:red}.x{@extend %a}",
    ] {
        assert_eq!(
            compile(&request(source)).unwrap_err().code,
            "EU_EXTEND",
            "{source}"
        );
    }
}

#[test]
fn rejects_legacy_suffixes_but_not_strings_or_comments() {
    let err = compile(&request(".card {\n  &__title { color: red; }\n}")).unwrap_err();
    assert_eq!(
        (err.code.as_str(), err.line, err.column),
        ("EU_LEGACY_SUFFIX", 2, 3)
    );
    assert!(compile(&request(
        r#".card { &[data-x="&__title"] { color: red; } /* &__title */ }"#
    ))
    .is_ok());
    assert_eq!(
        compile(&request(".x { :is(&__title) { color:red } }"))
            .unwrap_err()
            .code,
        "EU_LEGACY_SUFFIX"
    );
}

#[test]
fn error_positions_handle_unicode_and_crlf() {
    let err = compile(&request("/* 🙂 */\r\n.x {\r\n @color fg;\r\n}")).unwrap_err();
    assert_eq!((err.line, err.column), (3, 2));
    let err = compile(&request(".🙂 { @color fg; }")).unwrap_err();
    assert_eq!((err.line, err.column), (1, 7));
}

#[test]
fn unsupported_features_fail_explicitly() {
    assert_eq!(
        compile(&request(".x { @at-root {color:red} }"))
            .unwrap_err()
            .code,
        "EU_UNSUPPORTED"
    );
}

#[test]
fn plain_css_and_custom_at_rules_survive() {
    let out = compile(&request("@font-face { font-family: Example; src: url(example.woff2); } @custom-rule x { .x { --tokens: { a: 1; b: 2 }; color: red } }")).unwrap();
    assert!(out.css.contains("@custom-rule x"));
    assert!(out.css.contains("--tokens: { a: 1; b: 2 }"));
}

#[test]
fn unported_functions_cannot_leak_into_output() {
    assert_eq!(
        compile(&request(".x { width: calc(10px + between(10px-20px)); }"))
            .unwrap_err()
            .code,
        "EU_UNSUPPORTED"
    );
    assert_eq!(
        compile(&request(
            ".x { width: vertical-rhythm(theme.typography.sizes.base); }"
        ))
        .unwrap_err()
        .code,
        "EU_UNSUPPORTED"
    );
    assert!(compile(&request(
        ".x { content: 'theme(colors.red)'; /* ease() */ }"
    ))
    .is_ok());
}

#[test]
fn missing_size_configuration_and_invalid_font_units_fail_explicitly() {
    let mut req = request(".x { @space width 20vw; }");
    req.config["setMaxForVw"] = json!(true);
    assert_eq!(compile(&req).unwrap_err().code, "EU_SIZE");
    let mut req = request(".x { @fontsize special mobile; }");
    req.config["theme"]["typography"] =
        json!({"sizes":{"special":{"mobile":{"font-size":"20wrong"}}}});
    assert_eq!(compile(&req).unwrap_err().code, "EU_SIZE");
}
