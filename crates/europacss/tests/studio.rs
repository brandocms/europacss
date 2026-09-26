use europacss::{compile, resolve_config, studio, Request};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[test]
fn studio_specimens_use_real_compilation_and_preserve_resolved_references() {
    let source = include_str!("../studio/example.json5");
    let preview = studio::preview(source).unwrap();
    assert_eq!(preview.breakpoints.len(), 3);
    assert!(preview
        .families
        .iter()
        .any(|(name, css)| name == "sans" && css.contains("system-ui")));
    assert_eq!(preview.specimens.len(), 15);
    assert!(
        preview.specimens.iter().all(|s| s.error.is_none()),
        "{}",
        serde_json::to_string(&preview).unwrap()
    );
    let body = preview.specimens.iter().find(|s| s.name == "body").unwrap();
    let value: Value = json5::from_str(source).unwrap();
    let expected = compile(&Request {
        source: format!("#{}{{@fontsize body}}", body.id),
        config: resolve_config(value).unwrap(),
        ..Request::default()
    })
    .unwrap();
    assert_eq!(body.css, expected.css);
    let preview =
        studio::preview("{theme:{spacing:{alias:'{spacing.md}',md:{'*':'17px'}}}}").unwrap();
    assert!(preview
        .specimens
        .iter()
        .find(|s| s.name == "alias")
        .unwrap()
        .css
        .contains("17px"));
}

#[test]
fn studio_rejects_invalid_data_and_isolates_invalid_tokens() {
    for source in [
        "{a:1,a:2}",
        "{x:NaN}",
        "{theme:{colors:()=>({})}}",
        "{theme:{spacing:{a:'{spacing.b}',b:'{spacing.a}'}}}",
    ] {
        assert!(studio::preview(source).is_err(), "{source}");
    }
    let result = studio::preview(
        "{theme:{spacing:{good:{'*':'20px'},'bad;} .escape{color:red':{'*':'20px'}}}}",
    )
    .unwrap();
    assert!(result
        .specimens
        .iter()
        .find(|s| s.name == "good")
        .unwrap()
        .error
        .is_none());
    assert!(result
        .specimens
        .iter()
        .find(|s| s.name.starts_with("bad"))
        .unwrap()
        .error
        .is_some());
    assert!(!result.css.contains(".escape"));
    assert!(studio::preview(&" ".repeat(1024 * 1024 + 1)).is_err());
}

#[test]
fn studio_server_runs_without_node_and_never_rewrites_the_config() {
    let root = std::env::temp_dir().join(format!("europa-studio-test-{}", std::process::id()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::process::Child, std::path::PathBuf);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
            let _ = fs::remove_dir_all(&self.1);
        }
    }
    fs::create_dir_all(root.join("css/includes")).unwrap();
    fs::create_dir_all(root.join("public/fonts")).unwrap();
    fs::write(root.join("public/fonts/Test.woff2"), b"wOF2\0test font").unwrap();
    fs::write(root.join("css/includes/fonts.css"), r#"
      @font-face {font-family:'Test';font-weight:350;src:local('Test'), url('/assets/fonts/Test.woff2?v=1') format('woff2')}
      @font-face {font-family:'Other';src:url('https://example.com/font.woff2')}
      @font-face {font-family:'Escape';src:url('/fonts/%2e%2e/%2e%2e/europa.json5')}
    "#).unwrap();
    let config = root.join("europa.json5");
    let source = "{ // keep this comment\n theme: { spacing: { demo: {'*': '18px'} } } }";
    fs::write(&config, source).unwrap();
    let log = root.join("studio.log");
    let child = Command::new(env!("CARGO_BIN_EXE_europa"))
        .args([
            "studio",
            "--config",
            config.to_str().unwrap(),
            "--port",
            "0",
        ])
        .env("PATH", "")
        .env("NO_COLOR", "1")
        .stdout(Stdio::null())
        .stderr(fs::File::create(&log).unwrap())
        .spawn()
        .unwrap();
    let _cleanup = Cleanup(child, root);
    let deadline = Instant::now() + Duration::from_secs(10);
    let address = loop {
        let log = fs::read_to_string(&log).unwrap();
        if let Some(url) = log
            .split_whitespace()
            .find(|s| s.starts_with("http://127.0.0.1:"))
        {
            break url.trim_start_matches("http://").to_owned();
        }
        assert!(Instant::now() < deadline, "{log}");
        std::thread::sleep(Duration::from_millis(20));
    };
    let send = |method: &str, path: &str, headers: &str, body: &str| {
        let mut stream = TcpStream::connect(&address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        write!(stream,"{method} {path} HTTP/1.1\r\nHost: {address}\r\nContent-Length: {}\r\n{headers}\r\n{body}",body.len()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    };
    let fonts = send("GET", "/api/fonts", "", "");
    let fonts: Value = serde_json::from_str(fonts.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(fonts["faces"].as_array().unwrap().len(), 1);
    assert_eq!(fonts["faces"][0]["weight"], "350");
    assert!(fonts["css"].as_str().unwrap().contains("/api/fonts/0"));
    assert!(!fonts["css"].as_str().unwrap().contains("local("));
    assert!(!fonts["css"].as_str().unwrap().contains("https:"));
    assert!(fonts["warnings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v.as_str().unwrap().contains("leaves")));
    assert!(fonts.get("assets").is_none());
    let asset = send("GET", "/api/fonts/0", "", "");
    assert!(asset.contains("Content-Type: font/woff2"));
    assert_eq!(
        asset.split_once("\r\n\r\n").unwrap().1.as_bytes(),
        b"wOF2\0test font"
    );
    assert!(send("GET", "/api/fonts/../europa.json5", "", "").starts_with("HTTP/1.1 404"));
    assert!(
        send("GET", "/api/fonts/0", "Origin: https://example.com\r\n", "")
            .starts_with("HTTP/1.1 400")
    );
    let loaded = send("GET", "/api/config", "", "");
    assert!(loaded.starts_with("HTTP/1.1 200"));
    let parsed: Value = serde_json::from_str(loaded.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(parsed["source"], source);
    let accessibility = send("GET", "/accessibility.js", "", "");
    assert!(accessibility.starts_with("HTTP/1.1 200"));
    assert!(accessibility.contains("window.EuropaAccessibility"));
    let body = json!({"source": "{theme:{spacing:{demo:{'*':'40px'}}}}"}).to_string();
    let good = send(
        "POST",
        "/api/preview",
        "Content-Type: application/json\r\n",
        &body,
    );
    assert!(good.starts_with("HTTP/1.1 200"));
    assert!(good.contains("40px"));
    assert!(send(
        "POST",
        "/api/preview",
        "Content-Type: application/json\r\n",
        &json!({"source":"{x:1,x:2}"}).to_string()
    )
    .starts_with("HTTP/1.1 422"));
    assert!(send(
        "POST",
        "/api/preview",
        "Origin: https://example.com\r\nContent-Type: application/json\r\n",
        &body
    )
    .starts_with("HTTP/1.1 400"));
    assert!(send(
        "POST",
        "/api/preview",
        "Content-Type: text/plain\r\n",
        &body
    )
    .starts_with("HTTP/1.1 400"));
    assert!(send("GET", "/../../etc/passwd", "", "").starts_with("HTTP/1.1 404"));
    assert_eq!(fs::read_to_string(config).unwrap(), source);
}

#[test]
fn studio_exposes_resolved_colors_with_source_links_and_compiles_root_size() {
    let source = r##"{theme:{
      colors:{ink:'#111',alias:'{colors.ink}', nested:{paper:'#eee'},
        'nested/paper':'#fff', translucent:'rgb(0 0 0 / 50%)', variable:'var(--color)'},
      typography:{base:'20px',sizes:{body:{'*':'1rem'}}},
      extend:{colors:{ink:'#222'}},
    }}"##;
    // An extension replaces this category shallowly; source metadata follows it.
    let preview = studio::preview(source).unwrap();
    let ink = preview.colors.iter().find(|c| c.name == "ink").unwrap();
    assert_eq!(ink.value, "#222");
    assert_eq!(
        ink.config_paths,
        vec![vec!["theme", "extend", "colors", "ink"]]
    );
    let source = source.replace("extend:{colors:{ink:'#222'}},", "");
    let preview = studio::preview(&source).unwrap();
    let find = |name: &str| preview.colors.iter().find(|c| c.name == name).unwrap();
    assert_eq!(find("alias").value, "#111");
    assert_eq!(
        find("alias").dependency_paths,
        vec![vec!["theme", "colors", "ink"]]
    );
    assert_eq!(find("nested/paper").value, "#fff");
    assert_eq!(
        find("nested/paper").config_paths,
        vec![vec!["theme", "colors", "nested/paper"]]
    );
    assert_eq!(
        preview
            .colors
            .iter()
            .filter(|c| c.name == "nested/paper")
            .count(),
        1
    );
    assert_eq!(find("variable").value, "var(--color)");
    assert_eq!(find("translucent").value, "rgb(0 0 0 / 50%)");
    assert_eq!(
        find("translucent").compiled_value.as_deref(),
        Some("#00000080")
    );
    assert_eq!(
        find("variable").compiled_value.as_deref(),
        Some("var(--color)")
    );
    let expected = compile(&Request {
        source: "html {font-size:theme('typography.base', 16px)}".into(),
        config: resolve_config(json5::from_str(&source).unwrap()).unwrap(),
        ..Request::default()
    })
    .unwrap();
    assert_eq!(preview.root_css, expected.css);
    assert!(preview.root_css.contains("20px"));
    let fallback = studio::preview("{theme:{typography:{sizes:{}}}}").unwrap();
    assert!(fallback.root_css.contains("16px"));
    let palette = (0..129)
        .map(|i| (format!("color{i}"), json!("#123456")))
        .collect::<serde_json::Map<_, _>>();
    let capped = studio::preview(&json!({"theme":{"colors":palette}}).to_string()).unwrap();
    assert_eq!(capped.colors.len(), 128);
    assert!(capped
        .notes
        .iter()
        .any(|note| note.contains("128 resolved color tokens")));
}

#[test]
fn studio_source_links_follow_literal_keys_overrides_references_and_defaults() {
    let preview = studio::preview(r#"{
      theme: {
        spacing: {base: '12px', alias: '{spacing.base}', nested: {small: '4px'}, 'literal/slash': '6px'},
        typography: {sizes: {old: {'*': '16px'}}},
        extend: {
          spacing: {base: '20px'},
          typography: {sizes: {'title/slash': {'*': '40px'}}},
        },
      },
    }"#).unwrap();
    let find = |name: &str| preview.specimens.iter().find(|s| s.name == name).unwrap();
    assert_eq!(
        find("base").config_paths,
        vec![vec!["theme", "extend", "spacing", "base"]]
    );
    assert_eq!(
        find("alias").config_paths,
        vec![vec!["theme", "spacing", "alias"]]
    );
    assert_eq!(
        find("alias").dependency_paths,
        vec![vec!["theme", "extend", "spacing", "base"]]
    );
    assert_eq!(
        find("nested/small").config_paths,
        vec![vec!["theme", "spacing", "nested", "small"]]
    );
    assert_eq!(
        find("literal/slash").config_paths,
        vec![vec!["theme", "spacing", "literal/slash"]]
    );
    assert_eq!(
        find("title/slash").config_paths,
        vec![vec![
            "theme",
            "extend",
            "typography",
            "sizes",
            "title/slash"
        ]]
    );
    assert!(find("container").config_paths.is_empty());
    assert!(!preview.specimens.iter().any(|s| s.name == "old"));
    let preview = studio::preview("{theme:{spacing:'{scales}',scales:{small:'4px'}}}").unwrap();
    let small = preview
        .specimens
        .iter()
        .find(|s| s.name == "small")
        .unwrap();
    assert_eq!(small.config_paths, vec![vec!["theme", "spacing"]]);
    assert_eq!(small.dependency_paths, vec![vec!["theme", "scales"]]);
}
