#[allow(dead_code)]
mod support;

use europacss::{compile, compile_file_with, compile_with, EmbedOptions, Error, ExternalUrls};
use serde_json::json;
use support::{config, request};

const SCOPE: &str = r#"[b-tpl="hero"]"#;

fn scoped(source: &str) -> Result<String, Error> {
    compile_with(
        &request(source, config()),
        &EmbedOptions {
            scope: Some(SCOPE.into()),
            ..Default::default()
        },
    )
    .map(|output| output.css)
}

fn with_urls(source: &str, external_urls: ExternalUrls) -> Result<String, Error> {
    compile_with(
        &request(source, config()),
        &EmbedOptions {
            external_urls,
            ..Default::default()
        },
    )
    .map(|output| output.css)
}

fn same_css(actual: Result<String, Error>, expected: &str) {
    let expected = compile(&request(expected, config())).unwrap().css;
    assert_eq!(actual.unwrap(), expected);
}

fn rejected(result: Result<String, Error>, code: &str, line: usize, column: usize) -> Error {
    let error = result.unwrap_err();
    assert_eq!(
        (error.code.as_str(), error.line, error.column),
        (code, line, column),
        "{error}"
    );
    error
}

#[test]
fn scope_nests_the_source_in_the_selector() {
    same_css(
        scoped(
            ".inner { color: red; &:hover { color: blue; } }\n\
             & + & { margin-top: 0; }\n\
             > .direct { color: green; }\n\
             body.dark & { color: white; }\n\
             @media (min-width: 10px) { .x { color: black; } }\n\
             .a { & ~ .b { color: gray; } }",
        ),
        r#"[b-tpl="hero"] {
             .inner { color: red; &:hover { color: blue; } }
             & + & { margin-top: 0; }
             > .direct { color: green; }
             body.dark & { color: white; }
             @media (min-width: 10px) { .x { color: black; } }
             .a { & ~ .b { color: gray; } }
           }"#,
    );
}

#[test]
fn scope_keeps_europa_directives_and_placeholders() {
    same_css(
        scoped(
            "%button { color: red; }\n.a { @extend %button; @space margin-top 10px; @responsive $lg { color: blue; } }",
        ),
        "%button { color: red; }\n[b-tpl=\"hero\"] { .a { @extend %button; @space margin-top 10px; @responsive $lg { color: blue; } } }",
    );
}

#[test]
fn scope_rejects_a_stray_closing_brace_at_its_location() {
    // Text concatenation would let this escape: `[b-tpl] { .a {} } body {…}`.
    rejected(
        scoped(".a { color: red; }\n} body { display: none; } .x {"),
        "EU_PARSE",
        2,
        1,
    );
}

#[test]
fn scope_rejects_selectors_that_reach_outside_it() {
    for (source, column) in [
        ("& ~ * { display: none; }", 1),
        ("~ .next { display: none; }", 1),
        ("+ .next { display: none; }", 1),
        (".a, & + .b { display: none; }", 1),
        (".x:not(&) { display: none; }", 1),
        ("body:has(&) { overflow: hidden; }", 1),
        (":is(&) ~ * { display: none; }", 1),
        (".a { color: red; }\n&.on { & + .b { color: red; } }", 8),
        ("@media print { & ~ * { display: none; } }", 16),
    ] {
        let line = 1 + usize::from(source.contains('\n'));
        let error = rejected(scoped(source), "EU_SCOPE", line, column);
        assert!(error.message.contains("outside the scope"), "{error}");
    }
}

#[test]
fn scope_rejects_page_wide_at_rules() {
    for source in [
        "@keyframes spin { to { rotate: 1turn; } }",
        "@font-face { font-family: x; src: url(x.woff2); }",
        "@property --x { syntax: '*'; inherits: false; }",
        "@layer base, components;",
        "@europa base;",
        "@page { margin: 0; }",
        "@scope (.a) { .b { color: red; } }",
        "@import url(\"https://example.com/x.css\");",
    ] {
        let error = rejected(scoped(source), "EU_SCOPE", 1, 1);
        assert!(
            error.message.contains("not allowed in scoped styles"),
            "{error}"
        );
    }
    same_css(
        scoped(
            "@supports (display: grid) { @layer ui { @starting-style { .a { opacity: 0; } } } }",
        ),
        r#"[b-tpl="hero"] { @supports (display: grid) { @layer ui { @starting-style { .a { opacity: 0; } } } } }"#,
    );
}

#[test]
fn invalid_scope_selectors_are_errors() {
    for scope in ["", "a {", "& .x", "%placeholder", "@media print", "a; b"] {
        let error = compile_with(
            &request(".a { color: red; }", config()),
            &EmbedOptions {
                scope: Some(scope.into()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert_eq!(error.code, "EU_SCOPE", "{scope}: {error}");
    }
}

#[test]
fn external_urls_deny_absolute_urls_but_keep_local_ones() {
    let local = "div { background: url(/a.png), url(b.png), url(#f), url(\"data:image/png;base64,AA==\"), image-set(\"c.png\" 1x); }";
    same_css(with_urls(local, ExternalUrls::Deny), local);
    for (source, column) in [
        (
            "div { background: url(https://cdn.example.com/a.png); }",
            23,
        ),
        ("div { background: url(\"//evil.example/a\"); }", 23),
        ("div { background: url(\"/\\\\evil.example/a\"); }", 23),
        ("div { background: url(\\68ttps://evil.example/a); }", 23),
        ("div { background: url(\" https://evil.example/a\"); }", 23),
        (
            "div { background: image-set(\"https://evil.example/a.png\" 1x); }",
            29,
        ),
        (
            "div { background: image(\"https://evil.example/a.png\"); }",
            25,
        ),
        ("div { --bg: url(https://evil.example/a.png); }", 17),
        ("div { background: url(\"javascript:alert(1)\"); }", 23),
        (
            "div {\n  background: url(\"HTTPS://evil.example/a\");\n}",
            19,
        ),
    ] {
        let line = 1 + source.matches('\n').count().min(1);
        rejected(
            with_urls(source, ExternalUrls::Deny),
            "EU_EXTERNAL_URL",
            line,
            column,
        );
    }
}

#[test]
fn external_urls_allow_listed_hosts_only() {
    let hosts = ExternalUrls::parse("cdn.example.com, Fonts.Example.com.").unwrap();
    let allowed = "div { background: url(https://cdn.example.com/a.png), url(\"//fonts.example.com:443/b\"); }";
    same_css(with_urls(allowed, hosts.clone()), allowed);
    for source in [
        "div { background: url(https://cdn.example.com.evil/a); }",
        "div { background: url(https://cdn.example.com@evil.example/a); }",
        "div { background: url(https://evil.example/cdn.example.com); }",
        "div { background: url(\"https://evil.example\\\\@cdn.example.com/\"); }",
    ] {
        let error = rejected(with_urls(source, hosts.clone()), "EU_EXTERNAL_URL", 1, 23);
        assert!(
            error.message.contains("cdn.example.com, fonts.example.com"),
            "{error}"
        );
    }
}

#[test]
fn external_urls_check_imports() {
    let import = "@import url(\"https://cdn.example.com/x.css\");\n.a { color: red; }";
    rejected(
        with_urls(import, ExternalUrls::Deny),
        "EU_EXTERNAL_URL",
        1,
        1,
    );
    let hosts = ExternalUrls::parse("cdn.example.com").unwrap();
    with_urls(import, hosts.clone()).unwrap();
    rejected(
        with_urls("@import \"https://evil.example/x.css\";", hosts.clone()),
        "EU_EXTERNAL_URL",
        1,
        9,
    );
    rejected(
        with_urls("@import url(\"data:text/css,a{}\");", hosts),
        "EU_EXTERNAL_URL",
        1,
        1,
    );
}

#[test]
fn external_url_policies_parse_from_requests() {
    let parse = |value| serde_json::from_value::<EmbedOptions>(json!({ "externalUrls": value }));
    assert_eq!(
        parse(json!("deny")).unwrap().external_urls,
        ExternalUrls::Deny
    );
    assert_eq!(
        parse(json!("allow")).unwrap().external_urls,
        ExternalUrls::Allow
    );
    assert_eq!(
        parse(json!(["CDN.example.com"])).unwrap().external_urls,
        ExternalUrls::Hosts(vec!["cdn.example.com".into()])
    );
    for invalid in [
        json!("https://cdn.example.com"),
        json!([""]),
        json!(["a b"]),
        json!(3),
    ] {
        assert!(parse(invalid.clone()).is_err(), "{invalid}");
    }
}

#[test]
fn files_compile_with_the_same_options() {
    let dir = std::env::temp_dir().join(format!("europa-embed-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let dir = std::fs::canonicalize(dir).unwrap();
    std::fs::write(dir.join("part.css"), ".part { & ~ * { color: red; } }").unwrap();
    std::fs::write(
        dir.join("module.css"),
        "@import \"./part.css\";\n.a { color: red; }",
    )
    .unwrap();
    let request = europacss::Request {
        filename: dir.join("module.css").to_string_lossy().into_owned(),
        ..request("", config())
    };
    let options = EmbedOptions {
        scope: Some(SCOPE.into()),
        external_urls: ExternalUrls::Deny,
    };
    let output = compile_file_with(&request, None, &options).unwrap();
    assert!(
        output.css.contains("[b-tpl=hero] .part~*"),
        "{}",
        output.css
    );
    std::fs::write(dir.join("part.css"), "& ~ * { color: red; }").unwrap();
    let error = compile_file_with(&request, None, &options).unwrap_err();
    assert_eq!(
        (error.code.as_str(), error.line, error.column),
        ("EU_SCOPE", 1, 1)
    );
    assert_eq!(
        error.filename.as_deref(),
        Some(dir.join("part.css").to_str().unwrap())
    );
    std::fs::remove_dir_all(dir).unwrap();
}
