use europacss::{compile, compile_frontend, resolve_config, Request};
use serde_json::json;

fn request(source: &str) -> Request {
    Request {
        source: source.into(),
        filename: "source.css".into(),
        source_map: true,
        config: resolve_config(json!({})).unwrap(),
        browsers: vec!["chrome 100".into()],
        ..Request::default()
    }
}

#[test]
fn bundled_base_compiles_with_default_theme_and_all_nested_directives() {
    let output = compile(&request("@europa base;")).unwrap();
    assert!(output.warnings.is_empty(), "{:?}", output.warnings);
    for expected in [
        "--ec-zoom: 1",
        "--font-base-px: 18px",
        "--font-base-vw: 18px",
        "--breakpoint-xs: 0",
        "--breakpoint-xl: 1900px",
        "--grid-gutter: 25px",
        "--container-padding: 15px",
        "BlinkMacSystemFont",
        "font-size: 18px",
        ".dbg-grid",
    ] {
        assert!(output.css.contains(expected), "Missing {expected}");
    }
    for extension in ["@iterate", "@unpack", "@space", "theme("] {
        assert!(!output.css.contains(extension), "{extension}");
    }
}

#[test]
fn bundles_expand_in_place_and_retain_layer_scope() {
    let output = compile_frontend(&request(
        ".before {color:red} @layer base {@europa base;} .after {color:blue}",
    ))
    .unwrap();
    assert!(output.css.find(".before").unwrap() < output.css.find("@layer base").unwrap());
    assert!(output.css.find("@layer base").unwrap() < output.css.find("html").unwrap());
    assert!(output.css.find(".dbg-grid").unwrap() < output.css.find(".after").unwrap());
    let nodes = europacss::parser::parse(&output.css).unwrap();
    assert_eq!(nodes.len(), 3);
    assert_eq!(nodes[1].text, "@layer base");
}

#[test]
fn arrows_use_configured_travel_and_native_nesting() {
    let mut req = request("@europa arrows;");
    req.config["theme"]["arrows"]["travel"] = json!("7px");
    let output = compile(&req).unwrap();
    assert!(output.css.contains("a:hover span.arrow-ne"));
    assert!(
        output.css.contains("translateY(-7px) translateX(7px)"),
        "{}",
        output.css
    );
}

#[test]
fn builtin_diagnostics_map_to_the_authored_directive() {
    let mut req = request("/* 🙂 */\r\n@europa base;");
    req.config["theme"]["columns"]["gutters"] = json!({});
    let error = compile(&req).unwrap_err();
    assert_eq!((error.line, error.column), (2, 1));
    for input in [
        "@europa;",
        "@europa missing;",
        ".x {@europa base;}",
        "@europa arrows {}",
    ] {
        assert!(compile(&request(input)).is_err(), "{input}");
    }
}

#[test]
fn builtins_are_vendored_and_preserve_the_legacy_styles() {
    assert_eq!(
        include_str!("../assets/base.css"),
        include_str!("../../../src/lib/plugins/css/base.css")
    );
    assert_eq!(
        include_str!("../assets/arrows.css"),
        include_str!("../../../src/lib/plugins/css/arrows.css")
    );
    assert!(include_str!("../assets/normalize.css").starts_with("/*! normalize.css v8.0.1"));
    assert!(include_str!("../assets/normalize.LICENSE.md")
        .contains("Nicolas Gallagher and Jonathan Neal"));
}
