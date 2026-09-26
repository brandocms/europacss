//! Frozen port of all 86 spacing and 52 font-size source cases. The fixtures
//! explain every intentional change; Node and the legacy compiler are not run.
use europacss::{compile, resolve_config, Request};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Fixtures {
    configs: Vec<Value>,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    id: String,
    title: String,
    config: usize,
    input: String,
    note: String,
    expected: Option<String>,
    error: Option<String>,
}
fn run(source: &str, config: Value) -> Result<String, europacss::Error> {
    compile(&Request {
        source: source.into(),
        filename: "legacy-case.css".into(),
        config: resolve_config(config)?,
        minify: true,
        source_map: true,
        browsers: vec!["chrome 100".into()],
    })
    .map(|output| output.css)
}
fn audit(prefix: &str, count: usize) {
    let fixture: Fixtures =
        serde_json::from_str(include_str!("fixtures/legacy-sizing.json")).unwrap();
    let cases: Vec<_> = fixture
        .cases
        .iter()
        .filter(|c| c.id.starts_with(prefix))
        .collect();
    assert_eq!(cases.len(), count);
    for case in cases {
        let config = &fixture.configs[case.config];
        let actual = run(&case.input, config.clone());
        let context = format!("{}: {}\n{}", case.id, case.title, case.note);
        match (&case.expected, &case.error) {
            (Some(expected), None) => assert_eq!(
                actual.unwrap_or_else(|e| panic!("{context}: {e}")),
                run(expected, config.clone()).unwrap(),
                "{context}"
            ),
            (None, Some(code)) => assert_eq!(&actual.expect_err(&context).code, code, "{context}"),
            _ => panic!("Expected exactly one CSS or diagnostic assertion: {context}"),
        }
    }
}
#[test]
fn all_86_legacy_spacing_cases() {
    audit("space-", 86);
}
#[test]
fn all_52_legacy_fontsize_cases() {
    audit("fontsize-", 52);
}
