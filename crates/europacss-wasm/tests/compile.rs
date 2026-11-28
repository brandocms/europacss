use europacss_wasm::{compile_json, preview_json, resolve_json};
use serde_json::{json, Value};

const CONFIG: &str = r#"{
  // JSON5, as authored
  theme: {
    breakpoints: { mobile: '0', desktop: '1024px' },
    spacing: { md: { mobile: '10px', desktop: '20px' } },
    colors: { ink: '#123456', accent: '{colors.ink}' },
  },
}"#;

fn call(request: Value) -> Value {
    serde_json::from_slice(&compile_json(request.to_string().as_bytes())).unwrap()
}

#[test]
fn compiles_like_the_native_compiler() {
    let source = ".a { @space padding-x md; @color fg accent; }";
    let response = call(json!({"source": source, "config": CONFIG, "browsers": ["chrome 100"]}));
    let expected = europacss::compile(&europacss::Request {
        source: source.into(),
        filename: "input.css".into(),
        config: europacss::config_from_json5(CONFIG).unwrap(),
        browsers: vec!["chrome 100".into()],
        ..Default::default()
    })
    .unwrap();
    assert_eq!(response["error"], Value::Null);
    assert_eq!(response["css"], expected.css);
    assert!(expected.css.contains("#123456"));
    assert!(expected.css.contains("@media (min-width: 1024px)"));
}

#[test]
fn reports_stylesheet_errors_with_locations() {
    let response = call(json!({
        "source": ".a {\n  @space margin-top nope;\n}",
        "config": CONFIG,
        "filename": "theme.css",
    }));
    let error = &response["error"];
    assert_eq!(response["css"], Value::Null);
    assert_eq!(error["code"], "EU_SIZE");
    assert_eq!(error["filename"], "theme.css");
    assert_eq!(
        (error["line"].as_u64(), error["column"].as_u64()),
        (Some(2), Some(3))
    );
}

#[test]
fn reports_config_syntax_errors_in_the_config_file() {
    let response = call(
        json!({"source": ".a {}", "config": "{\n  theme: { colors: { a: 'x', a: 'y' } },\n}"}),
    );
    let error = &response["error"];
    assert_eq!(error["filename"], "europa.json5");
    assert_eq!(error["code"], "EU_CONFIG");
    assert_eq!(error["line"], 2);
    assert!(
        error["message"]
            .as_str()
            .unwrap()
            .contains("Duplicate config key"),
        "{error}"
    );

    let response =
        call(json!({"source": ".a {}", "config": "{ theme: { breakpoints: { a: 'wide' } } }"}));
    assert_eq!(response["error"]["filename"], "europa.json5");
    assert_eq!(response["error"]["line"], 0);

    let response =
        call(json!({"source": ".a {}", "config": "{\n  theme: { spacing: { 1: '4px' } },\n}"}));
    let error = &response["error"];
    assert_eq!(
        (error["line"].as_u64(), error["column"].as_u64()),
        (Some(2), Some(23)),
        "{error}"
    );
    let message = error["message"].as_str().unwrap();
    assert!(
        message.ends_with("numeric keys must be quoted: '1'"),
        "{error}"
    );
    assert!(!message.contains(" at 2:"), "{error}");
}

#[test]
fn rejects_extends_and_malformed_requests() {
    let response = call(json!({"source": "", "config": "{ extends: './base.json5' }"}));
    assert!(response["error"]["message"]
        .as_str()
        .unwrap()
        .contains("extends"));

    let response: Value = serde_json::from_slice(&compile_json(b"{\"css\": 1}")).unwrap();
    assert_eq!(response["error"]["code"], "EU_REQUEST");
}

#[test]
fn defaults_without_config_and_returns_source_maps() {
    let response = call(json!({"source": ".a { @space margin-top md; }", "sourceMap": true}));
    assert_eq!(response["error"], Value::Null);
    assert!(response["css"].as_str().unwrap().contains("margin-top"));
    assert_eq!(response["map"]["sources"], json!(["input.css"]));
}

#[test]
fn previews_tokens() {
    let response: Value = serde_json::from_slice(&preview_json(CONFIG.as_bytes())).unwrap();
    let colors = response["preview"]["colors"].as_array().unwrap();
    assert!(colors
        .iter()
        .any(|c| c["name"] == "accent" && c["value"] == "#123456"));

    let response: Value = serde_json::from_slice(&preview_json(b"{ nope")).unwrap();
    assert!(response["error"].is_string());
}

#[test]
fn resolves_configs_for_editors() {
    let response: Value = serde_json::from_slice(&resolve_json(CONFIG.as_bytes())).unwrap();
    assert_eq!(response["config"]["theme"]["colors"]["accent"], "#123456");
    assert!(response["config"]["theme"]["typography"].is_object());

    let response: Value = serde_json::from_slice(&resolve_json(b"{ a: 1, a: 2 }")).unwrap();
    assert_eq!(response["error"]["code"], "EU_CONFIG");
}

#[test]
fn scope_and_external_urls_apply_to_compiles() {
    let response = call(json!({
        "source": ".inner { background: url(https://cdn.example.com/a.png); }",
        "config": CONFIG,
        "minify": true,
        "browsers": ["chrome 100"],
        "scope": "[b-tpl=hero]",
        "externalUrls": ["cdn.example.com"],
    }));
    assert_eq!(response["error"], Value::Null, "{response}");
    assert!(
        response["css"]
            .as_str()
            .unwrap()
            .starts_with("[b-tpl=hero] .inner{"),
        "{response}"
    );

    let response = call(json!({
        "source": ".a { color: red; }\n& ~ * { display: none; }",
        "scope": "[b-tpl=hero]",
    }));
    let error = &response["error"];
    assert_eq!(
        (error["code"].as_str(), error["line"].as_u64()),
        (Some("EU_SCOPE"), Some(2)),
        "{error}"
    );
    assert_eq!(error["filename"], "input.css");

    let response = call(json!({
        "source": "div { background: url(//evil.example/a); }",
        "externalUrls": "deny",
    }));
    assert_eq!(response["error"]["code"], "EU_EXTERNAL_URL", "{response}");

    let response = call(json!({ "source": ".a {}", "externalUrls": "https://cdn.example.com" }));
    assert_eq!(response["error"]["code"], "EU_REQUEST", "{response}");
}
