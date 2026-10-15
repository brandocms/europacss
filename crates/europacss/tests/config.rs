use europacss::{json_to_json5, resolve_config};
use serde_json::{json, Value};

#[test]
fn migrated_wrappers_leave_clean_spacing_without_reformatting_values() {
    let input = "module.exports = {\n  theme: {\n    colors: () => ({ dark: '#272b2a', label: 'keep  spaces' }),\n  },\n};\n";
    assert_eq!(
        europacss::migrate_config(input, "js").unwrap(),
        "{\n  theme: {\n    colors: { dark: '#272b2a', label: 'keep  spaces' },\n  },\n}\n"
    );
}

#[test]
fn static_javascript_config_migration_preserves_comments_strings_and_token_data() {
    let source = r#"/* original comments */
        'use strict';
        module /* comment */ . exports = {
            text: 'module.exports = {200: 3};',
            theme: {
                colors: {100: 'red', 200 /* label */: 'tan', text: '{colors.100}'},
                typography: {families: {brand: ['A // font', 'serif']}},
            },
        }; // trailing comment
    "#;
    let output = europacss::migrate_config(source, "cjs").unwrap();
    for comment in [
        "/* original comments */",
        "/* comment */",
        "/* label */",
        "// trailing comment",
    ] {
        assert!(output.contains(comment));
    }
    assert!(output.contains("'100': 'red'"));
    assert!(output.contains("'200' /* label */: 'tan'"));
    assert!(output.contains("'module.exports = {200: 3};'"));
    let raw: Value = json5::from_str(&output).unwrap();
    let config = resolve_config(raw).unwrap();
    assert_eq!(config["theme"]["colors"]["text"], "red");
    assert_eq!(
        config["theme"]["typography"]["families"]["brand"],
        json!(["A // font", "serif"])
    );
    let esm = europacss::migrate_config(
        "// ESM\nexport default { theme: { colors: { ink: 'black' } } };",
        "mjs",
    )
    .unwrap();
    assert!(esm.contains("// ESM"));
    assert_eq!(europacss::migrate_config(&esm, "json5").unwrap(), esm);
}

#[test]
fn constant_theme_callbacks_become_data_without_losing_comments() {
    let source = r#"module.exports = {
        theme: {
            'colors': () /* resolver */ => (/* palette */ {
                100: 'red', nested: { text: '() => (literal)'  },
            } /* result */),
            extend: { colors: () => ({ ink: '#123' }) },
        },
    };"#;
    let output = europacss::migrate_config(source, "cjs").unwrap();
    for comment in ["/* resolver */", "/* palette */", "/* result */"] {
        assert!(output.contains(comment));
    }
    let cfg = resolve_config(json5::from_str(&output).unwrap()).unwrap();
    assert_eq!(cfg["theme"]["colors"]["100"], "red");
    assert_eq!(cfg["theme"]["colors"]["nested"]["text"], "() => (literal)");
    assert_eq!(cfg["theme"]["colors"]["ink"], "#123");
}

#[test]
fn callback_conversion_rejects_dynamic_bodies_and_non_resolver_positions() {
    for source in [
        "module.exports = { theme: { colors: () => ({ ink: load() }) } };",
        "module.exports = { theme: { colors: () => ({ ...palette }) } };",
        "module.exports = { theme: { colors: () => ({ [key]: 'red' }) } };",
        "module.exports = { theme: { colors: () => ({ ink: value }) } };",
        "module.exports = { theme: { colors: async () => ({ ink: 'red' }) } };",
        "module.exports = { theme: { colors: () => { return { ink: 'red' }; } } };",
        "module.exports = { theme: { colors: () => ({ ink: 'red' }, execute()) } };",
        "module.exports = { theme: { colors: () => ({ ink: 'red' })() } };",
        "module.exports = { theme: { colors: () = > ({ ink: 'red' }) } };",
        "module.exports = { theme: { colors: ()\n=> ({ ink: 'red' }) } };",
        "module.exports = { theme: { colors: () => ({ ink: () => ({ x: 'red' }) }) } };",
        "module.exports = { colors: () => ({ ink: 'red' }) };",
        "module.exports = { theme: { nested: { colors: () => ({ ink: 'red' }) } } };",
    ] {
        assert!(
            europacss::migrate_config(source, "cjs").is_err(),
            "{source}"
        );
    }
}

#[test]
fn static_config_migration_declines_executable_and_semantically_ambiguous_inputs() {
    for source in [
        "module.exports = loadConfig();",
        "module.exports = {theme: t => ({colors: t('colors')})};",
        "module.exports = {...defaults};",
        "module.exports = {theme: {colors: {[name]: 'red'}}};",
        "module.exports = {}; console.log('executed');",
        "module.exports = {theme:{colors:{200:'red',100:'blue'}}};",
        "module.exports = {theme:{colors:{name:'red','100':'blue'}}};",
        "module.exports = {theme:{colors:{01:'red'}}};",
        "module.exports = {theme:{colors:{9007199254740993:'red'}}};",
        "module.exports = {theme:{__proto__:{colors:{ink:'red'}}}};",
        "module.exports = {theme:{colors:{ink:'red',ink:'blue'}}};",
        "module.exports = {dpxViewportSize: Infinity};",
        "module.exports = {text:'unterminated};",
        "module.exports = { /* unterminated",
    ] {
        assert!(europacss::migrate_config(source, "js").is_err(), "{source}");
    }
}

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

#[test]
fn config_migration_only_deprecates_the_unused_padding_setting_in_every_format() {
    let value = json!({"theme":{"typography":{"lineHeight":{"mobile":1.3},"paddingDivider":8,"sections":{"nav":{"mobile":"12px"}}},"extend":{"typography":{"lineHeight":{"desktop":1.4},"paddingDivider":10}},"colors":{"sections":"red"}}});
    for extension in ["json", "json5", "js"] {
        let source = if extension == "js" {
            format!("module.exports = {value}")
        } else {
            value.to_string()
        };
        let report = europacss::migrate_config_report(&source, extension).unwrap();
        assert_eq!(report.warnings.len(), 2);
        assert!(report
            .warnings
            .iter()
            .any(|w| w.starts_with("theme.extend.typography.paddingDivider")));
        assert!(report.warnings.iter().all(|w| {
            w.contains("paddingDivider is deprecated and preserved for compatibility")
                && w.contains("removed in EuropaCSS 0.2.0")
                && w.contains("no automatic padding effect in 0.13.1")
                && w.contains("theme.columns.gutters")
                && !w.contains("lineHeight")
                && !w.contains("sections")
        }));
        let migrated: Value = json5::from_str(&report.source).unwrap();
        assert_eq!(migrated, value);
    }
}

#[test]
fn converted_typography_keeps_rhythm_sections_and_explicit_padding_references() {
    let report = europacss::migrate_config_report(
        "module.exports = {theme:{breakpoints:{mobile:'0'},typography:{lineHeight:{mobile:1.5},paddingDivider:8,sizes:{body:{mobile:'20px'}},sections:{nav:{mobile:{'font-size':'18px','line-height':1.2}}}}}}",
        "js",
    )
    .unwrap();
    let config = resolve_config(json5::from_str(&report.source).unwrap()).unwrap();
    let request = europacss::Request {
        source: ".rhythm {@space margin-top vertical-rhythm(theme.typography.sizes.body) mobile;} .nav {@unpack theme.typography.sections.nav;} .padding {padding-right:calc(100% / theme(typography.paddingDivider));}".into(),
        filename: "typography.css".into(),
        config,
        minify: true,
        debug_tokens: false,
        source_map: false,
        browsers: vec!["chrome 100".into()],
    };
    let actual = europacss::compile(&request).unwrap();
    let mut expected = request;
    // Common declarations precede the responsive rules, even when their
    // all-width media wrappers are subsequently removed.
    expected.source = ".padding {padding-right:12.5%} .rhythm {margin-top:30px} .nav {font-size:18px;line-height:1.2}".into();
    assert_eq!(actual.css, europacss::compile(&expected).unwrap().css);

    let supported = europacss::migrate_config_report(
        "{theme:{typography:{lineHeight:{mobile:1.5},sections:{nav:{mobile:{'font-size':'18px'}}}}}}",
        "json5",
    )
    .unwrap();
    assert!(supported.warnings.is_empty());
}
