use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    sync::atomic::{AtomicUsize, Ordering},
};

struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "europa-cli-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn command(&self) -> Command {
        let mut command = Command::new(env!("CARGO_BIN_EXE_europa"));
        command.current_dir(&self.0).env("PATH", "");
        command
    }
}

#[test]
fn migration_check_reports_imported_specificity_and_order_without_writing() {
    let dir = Temp::new();
    let entry = "@import 'nested.css';";
    let nested = ".a,#b{.child{color:red}} .button{@space height 50px md;height:40px}";
    fs::write(dir.0.join("app.css"), entry).unwrap();
    fs::write(dir.0.join("nested.css"), nested).unwrap();
    let result = dir
        .command()
        .args([
            "migrate",
            "app.css",
            "--from",
            "1.0.0-beta.16",
            "--check",
            "--json",
            "--color",
            "always",
        ])
        .output()
        .unwrap();
    assert!(!result.status.success());
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(report["analysis_complete"], true);
    assert_eq!(report["fixed_files"], 0);
    let findings = report["findings"].as_array().unwrap();
    assert!(findings
        .iter()
        .any(|f| f["code"] == "EU_MIGRATION_SPECIFICITY"));
    assert!(findings.iter().any(|f| f["code"] == "EU_MIGRATION_ORDER"));
    assert!(findings
        .iter()
        .all(|f| f["filename"].as_str().unwrap().ends_with("nested.css")));
    assert_eq!(fs::read_to_string(dir.0.join("app.css")).unwrap(), entry);
    assert_eq!(
        fs::read_to_string(dir.0.join("nested.css")).unwrap(),
        nested
    );
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 2);
}

#[test]
fn migration_fix_only_changes_supported_syntax_and_rechecks_remaining_findings() {
    let dir = Temp::new();
    let entry = "@import 'nested.css'; .a,#b{.child{color:red}}";
    fs::write(dir.0.join("app.css"), entry).unwrap();
    fs::write(
        dir.0.join("nested.css"),
        "/* retained */ .card{color:red;&__title{color:blue}color:green}",
    )
    .unwrap();
    let run = || {
        dir.command()
            .args([
                "migrate",
                "app.css",
                "--from",
                "1.0.0-beta.16",
                "--fix",
                "--json",
            ])
            .output()
            .unwrap()
    };
    let result = run();
    assert!(
        !result.status.success(),
        "Specificity still needs a human decision"
    );
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(report["fixed_files"], 1);
    assert_eq!(report["findings"].as_array().unwrap().len(), 1);
    let fixed = fs::read_to_string(dir.0.join("nested.css")).unwrap();
    assert!(fixed.contains("/* retained */"));
    assert!(fixed.contains(".card__title"));
    assert!(!fixed.contains("&__title"));
    assert_eq!(fs::read_to_string(dir.0.join("app.css")).unwrap(), entry);
    let report: serde_json::Value = serde_json::from_slice(&run().stdout).unwrap();
    assert_eq!(report["fixed_files"], 0);
    assert_eq!(fs::read_to_string(dir.0.join("nested.css")).unwrap(), fixed);
    assert_eq!(
        fs::read_dir(&dir.0).unwrap().count(),
        2,
        "No temporary files remain"
    );
    fs::write(dir.0.join("app.css"), "@import 'nested.css';").unwrap();
    let result = run();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn migration_requires_a_known_source_version_and_keeps_diagnostics_visible() {
    let dir = Temp::new();
    let source = ".card:hover{&__title{color:red}}";
    fs::write(dir.0.join("app.css"), source).unwrap();
    for args in [
        vec!["migrate", "app.css", "--fix"],
        vec!["migrate", "app.css", "--from", "1.0.0", "--fix"],
        vec![
            "migrate",
            "app.css",
            "--from",
            "1.0.0-beta.16",
            "--check",
            "--fix",
        ],
    ] {
        assert!(!dir.command().args(args).output().unwrap().status.success());
        assert_eq!(fs::read_to_string(dir.0.join("app.css")).unwrap(), source);
    }
    let result = dir
        .command()
        .args([
            "migrate",
            "app.css",
            "--from",
            "1.0.0-beta.16",
            "--quiet",
            "--color",
            "always",
        ])
        .output()
        .unwrap();
    let error = String::from_utf8_lossy(&result.stderr);
    assert!(error.contains("\x1b["));
    assert!(error.contains("EU_MIGRATION_SUFFIX"));
    assert!(error.contains("app.css:1:"));
    assert!(error.contains("Flatten this subtree manually"));
    assert!(result.stdout.is_empty());
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn standalone_binary_compiles_json5_with_no_node_on_path() {
    let dir = Temp::new();
    fs::create_dir(dir.0.join("dist")).unwrap();
    fs::write(dir.0.join("input.css"), ".card { @color fg text; }").unwrap();
    fs::write(
        dir.0.join("europa.json5"),
        "{ // A comment\n theme: { colors: { ink: '#123456', text: '{colors.ink}', } }, }",
    )
    .unwrap();
    let result = dir
        .command()
        .args([
            "input.css",
            "--config",
            "europa.json5",
            "--targets",
            "chrome 100",
            "--source-map",
            "-o",
            "dist/output.css",
        ])
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let output = fs::read_to_string(dir.0.join("dist/output.css")).unwrap();
    assert!(output.contains("color: #123456"));
    assert!(output.contains("sourceMappingURL=output.css.map"));
    let map: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(dir.0.join("dist/output.css.map")).unwrap())
            .unwrap();
    assert_eq!(map["sources"][0], "../input.css");
    assert!(fs::read_to_string(dir.0.join("input.css"))
        .unwrap()
        .contains("@color"));
}

#[test]
fn stdin_stdout_and_default_config_work() {
    let dir = Temp::new();
    let mut child = dir
        .command()
        .args(["-", "--minify", "--targets", "chrome 100"])
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b".x { @font serif; @color fg black; }")
        .unwrap();
    let result = child.wait_with_output().unwrap();
    assert!(result.status.success());
    let css = String::from_utf8(result.stdout).unwrap();
    assert!(css.contains("Georgia"));
    assert!(css.contains("color:#000"));
}

#[test]
fn diagnostics_fail_the_build_without_partial_output() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), ".card {\n &__title {color:red}\n}").unwrap();
    let result = dir
        .command()
        .args(["input.css", "-o", "output.css"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    let diagnostic = String::from_utf8_lossy(&result.stderr);
    assert!(diagnostic.contains("input.css:2:2"));
    assert!(diagnostic.contains("[EU_LEGACY_SUFFIX]"));
    assert!(diagnostic.contains("2 │  &__title {color:red}"));
    assert!(diagnostic.contains("│  ^"));
    assert!(!dir.0.join("output.css").exists());
}

#[test]
fn migration_writes_usable_json5_without_overwriting_existing_config() {
    let dir = Temp::new();
    fs::write(
        dir.0.join("resolved.json"),
        r##"{"theme":{"colors":{"ink":"#123456"}}}"##,
    )
    .unwrap();
    let result = dir
        .command()
        .args(["migrate-config", "resolved.json", "-o", "europa.json5"])
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let first = fs::read_to_string(dir.0.join("europa.json5")).unwrap();
    fs::write(dir.0.join("input.css"), ".x { @color fg ink; }").unwrap();
    let compiled = dir
        .command()
        .args([
            "input.css",
            "--config",
            "europa.json5",
            "--targets",
            "chrome 100",
        ])
        .output()
        .unwrap();
    assert!(
        compiled.status.success(),
        "{}",
        String::from_utf8_lossy(&compiled.stderr)
    );
    assert!(String::from_utf8_lossy(&compiled.stdout).contains("color: #123456"));
    let result = dir
        .command()
        .args(["migrate-config", "resolved.json", "-o", "europa.json5"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert_eq!(
        fs::read_to_string(dir.0.join("europa.json5")).unwrap(),
        first
    );
}

#[test]
fn config_loader_keeps_json_strict_and_accepts_json5_data() {
    let dir = Temp::new();
    let path = dir.0.join("europa.json5");
    let source = "{ /* comment */ theme: { colors: { ink: '#123456' } }, sizes: [+1, .5, 0x10], nullable: null, }";
    fs::write(&path, source).unwrap();
    let config = europacss::load_config(&path).unwrap();
    assert_eq!(config["sizes"], serde_json::json!([1, 0.5, 16]));
    assert!(config["nullable"].is_null());
    let json_path = dir.0.join("europa.json");
    fs::write(&json_path, source).unwrap();
    assert!(europacss::load_config(&json_path).is_err());
    fs::write(&json_path, r##"{"theme":{"colors":{"ink":"#123456"}}}"##).unwrap();
    assert_eq!(
        europacss::load_config(&json_path).unwrap()["theme"]["colors"],
        config["theme"]["colors"]
    );
}

#[test]
fn config_errors_identify_the_file_and_do_not_write_css() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), ".x {color:red}").unwrap();
    for (source, message) in [
        ("{theme: {sizes: [NaN]}}", "must be finite"),
        ("{theme: {sizes: {lg: Infinity}}}", "must be finite"),
        ("{theme: {sizes: {lg: -Infinity}}}", "must be finite"),
        (
            "{theme: {colors: {ink: 'red', ink: 'blue'}}}",
            "Duplicate config key `ink`",
        ),
        ("{theme: {colors: () => ({ink: 'red'})}}", "expected"),
        ("{\n theme: { colors: { ink 'red' } }\n}", "line 2"),
    ] {
        fs::write(dir.0.join("europa.json5"), source).unwrap();
        let result = dir
            .command()
            .args(["input.css", "--config", "europa.json5", "-o", "output.css"])
            .output()
            .unwrap();
        let error = String::from_utf8_lossy(&result.stderr);
        assert!(!result.status.success(), "{source}");
        assert!(
            error.contains("europa.json5") && error.contains(message),
            "{error}"
        );
        assert!(!dir.0.join("output.css").exists());
    }
    let nested = format!("{{theme: {}0{}}}", "[".repeat(140), "]".repeat(140));
    fs::write(dir.0.join("europa.json5"), nested).unwrap();
    assert!(europacss::load_config(&dir.0.join("europa.json5"))
        .unwrap_err()
        .contains("nesting limit"));
}

#[test]
fn cli_rejects_unknown_flags_and_refuses_input_overwrite() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), ".x {color:red}").unwrap();
    for args in [
        vec!["input.css", "--unknown"],
        vec!["input.css", "--source-map"],
        vec!["input.css", "-o", "input.css"],
    ] {
        assert!(!dir.command().args(args).output().unwrap().status.success());
    }
    assert_eq!(
        fs::read_to_string(dir.0.join("input.css")).unwrap(),
        ".x {color:red}"
    );
}

#[test]
fn file_imports_maps_and_rebased_assets_work_without_node() {
    let dir = Temp::new();
    fs::create_dir(dir.0.join("parts")).unwrap();
    fs::create_dir(dir.0.join("dist")).unwrap();
    fs::write(
        dir.0.join("input.css"),
        "@import 'parts/card.css';\n.entry{color:blue}",
    )
    .unwrap();
    fs::write(
        dir.0.join("parts/card.css"),
        ".card { @color fg red; background:url(pic.svg) }",
    )
    .unwrap();
    let result = dir
        .command()
        .args([
            "input.css",
            "--source-map",
            "--targets",
            "chrome 100",
            "-o",
            "dist/app.css",
        ])
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let css = fs::read_to_string(dir.0.join("dist/app.css")).unwrap();
    assert!(css.contains("../parts/pic.svg"));
    let map: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(dir.0.join("dist/app.css.map")).unwrap()).unwrap();
    let sources = map["sources"].as_array().unwrap();
    assert!(sources.contains(&serde_json::json!("../input.css")));
    assert!(sources.contains(&serde_json::json!("../parts/card.css")));
    assert_eq!(map["sourcesContent"].as_array().unwrap().len(), 2);
}

#[test]
fn imported_file_errors_are_reported_and_outputs_cannot_clobber_dependencies() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), "@import 'nested.css';").unwrap();
    fs::write(dir.0.join("nested.css"), "\n.card {@font no-such-font;}").unwrap();
    let result = dir
        .command()
        .args(["input.css", "-o", "out.css"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("nested.css:2:"));
    assert!(!dir.0.join("out.css").exists());
    fs::write(dir.0.join("nested.css"), ".card{color:red}").unwrap();
    let result = dir
        .command()
        .args(["input.css", "-o", "nested.css"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("must not overwrite"));
    assert_eq!(
        fs::read_to_string(dir.0.join("nested.css")).unwrap(),
        ".card{color:red}"
    );
    // Adjacent maps receive the same protection, before either output is written.
    fs::write(dir.0.join("input.css"), "@import 'out.css.map';").unwrap();
    fs::write(dir.0.join("out.css.map"), ".card{color:red}").unwrap();
    let result = dir
        .command()
        .args(["input.css", "--source-map", "-o", "out.css"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(!dir.0.join("out.css").exists());
    assert_eq!(
        fs::read_to_string(dir.0.join("out.css.map")).unwrap(),
        ".card{color:red}"
    );
}

#[test]
fn terminal_colors_are_controllable_and_never_contaminate_css() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), ".card{@color fg red;}").unwrap();
    for (mode, ansi) in [("auto", false), ("never", false), ("always", true)] {
        let result = dir
            .command()
            .args([
                "input.css",
                "--color",
                mode,
                "--minify",
                "--targets",
                "chrome 100",
            ])
            .output()
            .unwrap();
        assert!(result.status.success());
        let css = String::from_utf8(result.stdout).unwrap();
        let summary = String::from_utf8(result.stderr).unwrap();
        assert_eq!(css.trim(), ".card{color:red}");
        assert_eq!(summary.contains("\x1b["), ansi);
        for text in [
            "europa",
            "✓ compiled",
            "input.css",
            "stdout",
            "1 file",
            "minified",
        ] {
            assert!(summary.contains(text), "{summary}");
        }
    }
    let result = dir
        .command()
        .args(["input.css", "--quiet", "--color=always"])
        .output()
        .unwrap();
    assert!(result.status.success());
    assert!(result.stderr.is_empty());
    assert!(!result.stdout.contains(&0x1b));
    let result = dir
        .command()
        .args(["input.css", "--color=always"])
        .env("NO_COLOR", "1")
        .output()
        .unwrap();
    assert!(
        result.stderr.contains(&0x1b),
        "An explicit color choice overrides auto detection"
    );
    let result = dir
        .command()
        .args(["input.css"])
        .env("NO_COLOR", "1")
        .output()
        .unwrap();
    assert!(!result.stderr.contains(&0x1b));
    let result = dir
        .command()
        .args(["input.css", "--color", "rainbow"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("auto, always, or never"));
}

#[test]
fn colored_errors_include_imported_source_excerpts_even_in_quiet_mode() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), "@import 'nested.css';").unwrap();
    fs::write(
        dir.0.join("nested.css"),
        "/* context */\n.card {\n  @font missing;\n}\n",
    )
    .unwrap();
    let result = dir
        .command()
        .args(["input.css", "--color=always", "--quiet"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(result.stdout.is_empty());
    let error = String::from_utf8_lossy(&result.stderr);
    assert!(error.contains("\x1b[1;31m"));
    for text in ["[EU_CONFIG]", "nested.css:3:3", "@font missing;", "^"] {
        assert!(error.contains(text), "{error}");
    }
    assert!(!error.contains("✓ compiled"));
    fs::write(dir.0.join("nested.css"), "@unknown demo;").unwrap();
    let warning = dir
        .command()
        .args(["input.css", "--color=always", "--quiet"])
        .output()
        .unwrap();
    assert!(warning.status.success());
    let warning = String::from_utf8_lossy(&warning.stderr);
    assert!(warning.contains("\x1b[1;33m"));
    assert!(warning.contains("[EU_CSS_WARNING]"));
    assert!(!warning.contains("✓ compiled"));
}

#[test]
fn help_and_migration_share_the_terminal_style() {
    let dir = Temp::new();
    let help = dir
        .command()
        .args(["--help", "--color=always"])
        .output()
        .unwrap();
    assert!(help.status.success());
    assert!(help.stderr.is_empty());
    assert!(help.stdout.contains(&0x1b));
    assert!(String::from_utf8_lossy(&help.stdout).contains("--quiet"));
    let plain = dir.command().arg("--help").output().unwrap();
    assert!(!plain.stdout.contains(&0x1b));
    fs::write(dir.0.join("config.json"), "{}").unwrap();
    let result = dir
        .command()
        .args([
            "--color=always",
            "migrate-config",
            "config.json",
            "-o",
            "config.json5",
        ])
        .output()
        .unwrap();
    assert!(result.status.success());
    assert!(result.stdout.is_empty());
    assert!(String::from_utf8_lossy(&result.stderr).contains("✓ config converted"));
    assert!(result.stderr.contains(&0x1b));
}
