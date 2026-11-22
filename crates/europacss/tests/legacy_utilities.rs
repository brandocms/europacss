//! Native counterparts of utility behavior; retired JS-only contracts are explicit.
use europacss::{compile, parser, resolve_config, Request};
use serde_json::{json, Value};

fn cases() -> Vec<Value> {
    serde_json::from_str(include_str!("fixtures/legacy-utilities.json")).unwrap()
}

#[test]
fn all_14_applicable_legacy_reference_cases() {
    let mut count = 0;
    for case in cases().iter().filter(|c| {
        c["id"]
            .as_str()
            .unwrap()
            .starts_with("utils/resolveTokenReferences:")
            && c.get("retired").is_none()
    }) {
        count += 1;
        let result = resolve_config(json!({"theme": case["theme"]}));
        if let Some(error) = case.get("error") {
            assert_eq!(
                result.unwrap_err().code,
                error.as_str().unwrap(),
                "{}",
                case["id"]
            );
        } else {
            let result = result.unwrap();
            for (path, expected) in case["values"].as_object().unwrap() {
                assert_eq!(
                    result["theme"].pointer(path),
                    Some(expected),
                    "{}: {path}",
                    case["id"]
                );
            }
        }
    }
    assert_eq!(count, 14);
}

#[test]
fn all_six_media_packing_cases_preserve_the_correct_order() {
    let mut count = 0;
    for case in cases().iter().filter(|c| c.get("order").is_some()) {
        count += 1;
        let output = compile(&Request {
            source: case["input"].as_str().unwrap().into(),
            config: resolve_config(json!({})).unwrap(),
            browsers: vec!["chrome 131".into()],
            ..Default::default()
        })
        .unwrap();
        let nodes = parser::parse(&output.css).unwrap();
        let order: Vec<_> = nodes
            .iter()
            .map(|node| node.text.strip_prefix("@media ").unwrap())
            .collect();
        assert_eq!(json!(order), case["order"], "{}", case["id"]);
        if case["id"] == "utils/mqpacker:4" {
            let children = nodes[0].children.as_ref().unwrap();
            assert_eq!(
                children
                    .iter()
                    .map(|node| node.text.as_str())
                    .collect::<Vec<_>>(),
                [".test1", ".test2"]
            );
        }
    }
    assert_eq!(count, 6);
}

#[test]
fn three_retained_preset_env_behaviors_use_native_browser_targets() {
    let mut count = 0;
    for case in cases().iter().filter(|c| c.get("contains").is_some()) {
        count += 1;
        let output = compile(&Request {
            source: case["input"].as_str().unwrap().into(),
            config: resolve_config(json!({})).unwrap(),
            minify: true,
            browsers: case
                .get("browsers")
                .map(|v| serde_json::from_value(v.clone()).unwrap())
                .unwrap_or_default(),
            ..Default::default()
        })
        .unwrap();
        for fragment in case["contains"].as_array().unwrap() {
            assert!(
                output.css.contains(fragment.as_str().unwrap()),
                "{}: {}",
                case["id"],
                output.css
            );
        }
    }
    assert_eq!(count, 3);
}

#[test]
fn the_two_retired_cases_have_explicit_reasons() {
    let cases = cases();
    assert_eq!(cases.len(), 56);
    let retired: Vec<_> = cases
        .iter()
        .filter(|c| c.get("retired").is_some())
        .collect();
    assert_eq!(retired.len(), 2);
    assert_eq!(retired[0]["id"], "utils/presetEnv:3");
    assert_eq!(retired[1]["id"], "utils/resolveTokenReferences:15");
    for case in retired {
        assert!(!case["retired"].as_str().unwrap().is_empty());
    }
}
