use europacss::{json_to_toml, resolve_config};
use serde_json::{json, Value};

#[test]
fn defaults_sections_and_extensions_follow_the_existing_contract() {
    let result = resolve_config(
        json!({ "theme": { "colors": {"brand": "red"}, "extend": { "colors": {"ink": "blue"} } } }),
    )
    .unwrap();
    assert_eq!(
        result["theme"]["colors"],
        json!({ "brand": "red", "ink": "blue" })
    );
    assert!(result["theme"]["breakpoints"]["xs"].is_string());
    assert_eq!(result["dpxViewportSize"], 1440);
}

#[test]
fn references_preserve_types_and_interpolate_scalars() {
    let result = resolve_config(json!({ "theme": {
        "colors": { "ink": "#123456", "text": "{colors.ink}" },
        "border": "1px solid {colors.text}",
        "typography": { "families": { "main": ["Inter", "serif"] }, "sizes": { "body": { "__base__": {"font-family": "{typography.families.main}"} } } }
    } })).unwrap();
    assert_eq!(result["theme"]["border"], "1px solid #123456");
    assert_eq!(
        result["theme"]["typography"]["sizes"]["body"]["__base__"]["font-family"],
        json!(["Inter", "serif"])
    );
}

#[test]
fn cyclic_missing_and_non_scalar_interpolations_are_errors() {
    for theme in [
        json!({"a":"{b}","b":"{a}"}),
        json!({"a":"{missing}"}),
        json!({"a": {},"b":"prefix {a}"}),
    ] {
        assert_eq!(
            resolve_config(json!({"theme":theme})).unwrap_err().code,
            "EU_CONFIG"
        );
    }
}

#[test]
fn toml_comments_quoted_keys_and_migration_round_trip() {
    let input: Value = toml::from_str(
        r##"
# Theme data can have comments.
[theme.colors]
ink = "#123456" # Brand foreground
text = "{colors.ink}"
[theme.breakpointCollections]
"$desktop" = "md/lg/xl"
[theme.typography.sizes."heading/4xl"]
xs = "24px"
md = "48px"
"##,
    )
    .unwrap();
    let toml = json_to_toml(&input.to_string()).unwrap();
    let round_trip: Value = toml::from_str(&toml).unwrap();
    assert_eq!(round_trip, input);
    assert_eq!(
        resolve_config(input).unwrap()["theme"]["colors"]["text"],
        "#123456"
    );
}

#[test]
fn migration_does_not_silently_drop_json_nulls() {
    assert!(json_to_toml(r#"{"nullable":null}"#).is_err());
}
