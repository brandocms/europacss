//! Remaining legacy rule/output/function cases, with reviewed native semantics.
//! Fixtures never execute JS, regenerate expectations, or sort CSS for comparison.
use europacss::{compile, resolve_config, Request};
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Case {
    id: String,
    title: String,
    config: usize,
    input: String,
    note: String,
    expected: Option<String>,
    snapshot: Option<String>,
    error: Option<String>,
    contains: Option<Vec<String>>,
    config_assertions: Option<BTreeMap<String, Value>>,
}
#[derive(Deserialize)]
struct Fixtures {
    configs: Vec<Value>,
    cases: Vec<Case>,
}

fn audit(prefix: &str, count: usize) {
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("fixtures/legacy-rules.json")).unwrap();
    let cases: Vec<_> = fixtures
        .cases
        .iter()
        .filter(|c| c.id.starts_with(prefix))
        .collect();
    assert_eq!(cases.len(), count);
    for case in cases {
        let context = format!("{}: {}\n{}", case.id, case.title, case.note);
        assert_eq!(
            [
                case.expected.is_some(),
                case.snapshot.is_some(),
                case.error.is_some(),
                case.contains.is_some(),
                case.config_assertions.is_some()
            ]
            .into_iter()
            .filter(|x| *x)
            .count(),
            1,
            "{context}"
        );
        let config = resolve_config(fixtures.configs[case.config].clone()).unwrap();
        if let Some(assertions) = &case.config_assertions {
            for (path, expected) in assertions {
                assert_eq!(config.pointer(path), Some(expected), "{context}: {path}");
            }
            continue;
        }
        let mut request = Request {
            source: case.input.clone(),
            filename: case.id.clone(),
            config,
            minify: true,
            browsers: vec!["chrome 100".into()],
            ..Default::default()
        };
        let output = compile(&request);
        if let Some(error) = &case.error {
            assert_eq!(&output.expect_err(&context).code, error, "{context}");
            continue;
        }
        let output = output.unwrap_or_else(|error| panic!("{context}: {error}"));
        assert!(
            output.warnings.is_empty(),
            "{context}: {:?}",
            output.warnings
        );
        if let Some(expected) = &case.expected {
            request.source = expected.clone();
            assert_eq!(output.css, compile(&request).unwrap().css, "{context}");
        }
        if let Some(snapshot) = &case.snapshot {
            assert_eq!(&output.css, snapshot, "{context}");
        }
        if let Some(fragments) = &case.contains {
            for fragment in fragments {
                assert!(
                    output.css.contains(fragment),
                    "{context}: missing {fragment}"
                );
            }
        }
    }
}

#[test]
fn remaining_137_legacy_rule_cases() {
    audit("rules/", 137);
}
#[test]
fn all_three_legacy_output_fixtures() {
    audit("output/", 3);
}
#[test]
fn all_three_legacy_function_cases() {
    audit("utils/", 3);
}
