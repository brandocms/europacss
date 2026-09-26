use europacss::{json_to_json5, resolve_config};
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
fn json5_comments_quoted_keys_and_migration_round_trip() {
    let input: Value = json5::from_str(
        r##"
{
  // Theme data can have comments, single quotes, and trailing commas.
  theme: {
    colors: { ink: '#123456', text: '{colors.ink}' },
    breakpointCollections: { $desktop: 'md/lg/xl' },
    typography: {
      sizes: { 'heading/4xl': { xs: '24px', md: '48px' } },
    },
  },
}
"##,
    )
    .unwrap();
    let json5 = json_to_json5(&input.to_string()).unwrap();
    let round_trip: Value = json5::from_str(&json5).unwrap();
    assert_eq!(round_trip, input);
    assert_eq!(
        round_trip["theme"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        input["theme"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>()
    );
    assert_eq!(
        resolve_config(input).unwrap()["theme"]["colors"]["text"],
        "#123456"
    );
}

#[test]
fn migration_preserves_json_data_and_references() {
    let input = json!({
        "nullable": null,
        "enabled": false,
        "numbers": [0, -1, 1.25, u64::MAX],
        "theme": {"colors": {"ink": "red", "text": "{colors.ink}"}},
    });
    let output = json_to_json5(&input.to_string()).unwrap();
    let round_trip: Value = json5::from_str(&output).unwrap();
    assert_eq!(round_trip, input);
    assert!(output.ends_with('\n'));
}

#[test]
fn migration_rejects_invalid_config_before_serializing() {
    for input in [
        "[]",
        r#"{"theme":{"a":"{missing}"}}"#,
        r#"{"enabled":true,"enabled":false}"#,
        "{enabled: true}", // Export input remains strict JSON.
    ] {
        assert!(json_to_json5(input).is_err(), "{input}");
    }
}
