use europacss::{compile, resolve_config, Request};
use serde_json::{json, Value};

pub fn config() -> Value {
    json!({"theme": {
        "breakpoints": {"mobile":"0", "tablet":"740px", "desktop":"1024px"},
        "breakpointCollections": {"$sm":"mobile/tablet", "$lg":"desktop"}
    }})
}

pub fn request(source: &str, config: Value) -> Request {
    Request {
        source: source.into(),
        filename: "rule.css".into(),
        config: resolve_config(config).unwrap(),
        minify: true,
        source_map: true,
        browsers: vec!["chrome 100".into()],
    }
}

/// Compare against hand-written standard CSS through identical backend settings.
/// No legacy JS process or formatting/selector-sorting matcher is involved.
pub fn assert_css(source: &str, expected: &str, config: Value) {
    let actual = compile(&request(source, config.clone())).unwrap();
    let expected = compile(&request(expected, config)).unwrap();
    assert!(actual.warnings.is_empty(), "{:?}", actual.warnings);
    assert!(expected.warnings.is_empty(), "{:?}", expected.warnings);
    assert_eq!(actual.css, expected.css, "source: {source}");
}
