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

struct Watching(std::process::Child);
impl Drop for Watching {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn wait_for(mut ready: impl FnMut() -> bool, message: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !ready() {
        assert!(std::time::Instant::now() < deadline, "{message}");
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
}

#[test]
fn watch_rebuilds_config_and_imports_recovers_errors_and_avoids_output_loops() {
    let dir = Temp::new();
    let file = |name| dir.0.join(name);
    let read = |name| fs::read_to_string(file(name)).unwrap_or_default();
    fs::write(file("app.css"), "@import 'nested.css';").unwrap();
    fs::write(file("nested.css"), ".x{@color fg brand}").unwrap();
    fs::write(file("europa.json5"), "{theme:{colors:{brand:'red'}}}").unwrap();
    let log = fs::File::create(file("watch.log")).unwrap();
    let mut watching = Watching(
        dir.command()
            .args([
                "app.css",
                "--watch",
                "--config",
                "europa.json5",
                "--source-map",
                "-o",
                "out.css",
                "--color",
                "never",
            ])
            .stderr(log)
            .stdout(Stdio::null())
            .spawn()
            .unwrap(),
    );
    wait_for(|| read("out.css").contains("red"), "initial build");
    let modified = fs::metadata(file("out.css")).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(650));
    assert_eq!(
        fs::metadata(file("out.css")).unwrap().modified().unwrap(),
        modified,
        "Output/map files must not trigger a rebuild loop"
    );
    fs::write(file("europa.json5"), "{theme:{colors:{brand:'tan'}}}").unwrap();
    wait_for(|| read("out.css").contains("tan"), "config rebuild");
    let css = read("out.css");
    let map = read("out.css.map");
    fs::write(file("nested.css"), ".broken {").unwrap();
    wait_for(
        || read("watch.log").contains("EU_PARSE"),
        "syntax error must be visible",
    );
    assert_eq!(read("out.css"), css);
    assert_eq!(read("out.css.map"), map);
    fs::write(file("nested.css"), "@import 'new.css'; .x{@color fg brand}").unwrap();
    wait_for(
        || read("watch.log").contains("Cannot import"),
        "new missing import",
    );
    fs::write(file("new.css"), ".new{color:green}").unwrap();
    wait_for(
        || read("out.css").contains("green"),
        "missing import creation must recover",
    );
    let css = read("out.css");
    let log_length = read("watch.log").len();
    fs::remove_file(file("new.css")).unwrap();
    wait_for(
        || read("watch.log").len() > log_length,
        "deleted import must be noticed",
    );
    assert_eq!(read("out.css"), css);
    fs::write(file("new.css"), ".new{color:purple}").unwrap();
    wait_for(
        || read("out.css").contains("purple"),
        "deleted import restoration",
    );
    fs::write(file("replacement.css"), ".done{display:block}").unwrap();
    fs::rename(file("replacement.css"), file("app.css")).unwrap();
    wait_for(
        || read("out.css").contains(".done"),
        "editor atomic replacement",
    );
    let modified = fs::metadata(file("out.css")).unwrap().modified().unwrap();
    fs::write(file("nested.css"), ".no_longer_used{color:black}").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(650));
    assert_eq!(
        fs::metadata(file("out.css")).unwrap().modified().unwrap(),
        modified,
        "Removed dependencies must stop triggering builds"
    );
    assert!(watching.0.try_wait().unwrap().is_none());
    assert!(read("watch.log").contains("watching"));
}

#[test]
fn watch_rebuilds_inherited_configs_and_recovers_changed_parent_graphs() {
    let dir = Temp::new();
    let file = |name| dir.0.join(name);
    let read = |name| fs::read_to_string(file(name)).unwrap_or_default();
    fs::write(file("app.css"), ".x{@color fg text}").unwrap();
    fs::write(
        file("europa.json5"),
        "{extends:'base.json5',theme:{colors:{text:'{colors.ink}'}}}",
    )
    .unwrap();
    fs::write(file("base.json5"), "{extends:'palette.json5'}").unwrap();
    fs::write(file("palette.json5"), "{theme:{colors:{ink:'red'}}}").unwrap();
    let _watching = Watching(
        dir.command()
            .args([
                "app.css",
                "--watch",
                "--config",
                "europa.json5",
                "-o",
                "out.css",
            ])
            .stderr(fs::File::create(file("watch.log")).unwrap())
            .stdout(Stdio::null())
            .spawn()
            .unwrap(),
    );
    wait_for(
        || read("out.css").contains("red"),
        "initial inherited config",
    );
    fs::write(file("palette.json5"), "{theme:{colors:{ink:'tan'}}}").unwrap();
    wait_for(|| read("out.css").contains("tan"), "inherited palette edit");
    let previous = read("out.css");
    fs::write(file("base.json5"), "{extends:'missing.json5'}").unwrap();
    wait_for(
        || read("watch.log").contains("missing.json5"),
        "changed parent graph error",
    );
    assert_eq!(read("out.css"), previous);
    fs::write(file("missing.json5"), "{theme:{colors:{ink:'gold'}}}").unwrap();
    wait_for(|| read("out.css").contains("gold"), "new parent creation");
    let modified = fs::metadata(file("out.css")).unwrap().modified().unwrap();
    fs::write(file("palette.json5"), "{theme:{colors:{ink:'purple'}}}").unwrap();
    std::thread::sleep(std::time::Duration::from_millis(650));
    assert_eq!(
        fs::metadata(file("out.css")).unwrap().modified().unwrap(),
        modified,
        "Removed parents must stop triggering builds"
    );
    let length = read("watch.log").len();
    fs::remove_file(file("missing.json5")).unwrap();
    wait_for(|| read("watch.log").len() > length, "deleted parent");
    assert!(read("out.css").contains("gold"));
    fs::write(file("missing.json5"), "{theme:{colors:{ink:'purple'}}}").unwrap();
    wait_for(|| read("out.css").contains("purple"), "restored parent");
}

#[test]
fn inherited_config_files_cannot_be_overwritten_by_css_output() {
    let dir = Temp::new();
    fs::write(dir.0.join("app.css"), ".x{color:red}").unwrap();
    fs::write(dir.0.join("europa.json5"), "{extends:'base.json'}").unwrap();
    fs::write(dir.0.join("base.json"), "{}").unwrap();
    let result = dir
        .command()
        .args(["app.css", "--config", "europa.json5", "-o", "base.json"])
        .output()
        .unwrap();
    assert!(!result.status.success());
    assert!(String::from_utf8_lossy(&result.stderr).contains("must not overwrite"));
    assert_eq!(fs::read_to_string(dir.0.join("base.json")).unwrap(), "{}");
}

#[test]
fn watch_requires_file_input_and_output() {
    let dir = Temp::new();
    for args in [
        vec!["-", "--watch", "-o", "out.css"],
        vec!["app.css", "--watch"],
    ] {
        let result = dir.command().args(args).output().unwrap();
        assert!(!result.status.success());
        assert!(String::from_utf8_lossy(&result.stderr).contains("--watch requires"));
    }
}

#[test]
fn static_config_migration_runs_without_node_and_never_evaluates_expressions() {
    let dir = Temp::new();
    let source = "/* keep me */ module.exports = {theme:{colors:()=>({100:'red'})}};";
    fs::write(dir.0.join("europa.config.cjs"), source).unwrap();
    let result = dir
        .command()
        .args(["migrate-config", "europa.config.cjs", "-o", "europa.json5"])
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let migrated = fs::read_to_string(dir.0.join("europa.json5")).unwrap();
    assert!(migrated.contains("/* keep me */"));
    assert_eq!(
        fs::read_to_string(dir.0.join("europa.config.cjs")).unwrap(),
        source
    );
    fs::write(
        dir.0.join("unsafe.cjs"),
        "module.exports = require('fs').writeFileSync('SENTINEL', 'bad');",
    )
    .unwrap();
    let failed = dir
        .command()
        .args(["migrate-config", "unsafe.cjs", "-o", "unsafe.json5"])
        .output()
        .unwrap();
    assert!(!failed.status.success());
    assert!(!dir.0.join("unsafe.json5").exists());
    assert!(!dir.0.join("SENTINEL").exists());
}

#[test]
fn migration_accepts_only_reviewed_findings_and_rejects_stale_imports() {
    let dir = Temp::new();
    let source = ".a,#b{.child{color:red}}";
    fs::write(dir.0.join("app.css"), "@import 'nested.css';").unwrap();
    fs::write(dir.0.join("nested.css"), source).unwrap();
    fs::write(dir.0.join("europa.json5"), "{extends:'base.json5'}").unwrap();
    fs::write(dir.0.join("base.json5"), "{theme:{colors:{brand:'red'}}}").unwrap();
    let base = [
        "migrate",
        "app.css",
        "--from",
        "1.0.0-beta.16",
        "--config",
        "europa.json5",
        "--json",
    ];
    let result = dir.command().args(base).output().unwrap();
    let mut review: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(review["findings"][0]["accepted"], false);
    fs::write(dir.0.join("review.json"), review.to_string()).unwrap();
    let check = || {
        dir.command()
            .args(base)
            .args(["--accept", "review.json"])
            .output()
            .unwrap()
    };
    assert!(
        !check().status.success(),
        "Merely saving a report is not review"
    );
    review["findings"][0]["accepted"] = true.into();
    fs::write(dir.0.join("review.json"), review.to_string()).unwrap();
    let accepted = check();
    assert!(
        accepted.status.success(),
        "{}",
        String::from_utf8_lossy(&accepted.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&accepted.stdout).unwrap();
    assert_eq!(report["unresolved_findings"], 0);
    assert_eq!(report["findings"][0]["accepted"], true);
    fs::write(dir.0.join("base.json5"), "{theme:{colors:{brand:'tan'}}}").unwrap();
    let changed_parent = check();
    assert!(!changed_parent.status.success());
    assert!(String::from_utf8_lossy(&changed_parent.stderr).contains("stale"));
    fs::write(dir.0.join("base.json5"), "{theme:{colors:{brand:'red'}}}").unwrap();
    assert_eq!(
        fs::read_to_string(dir.0.join("nested.css")).unwrap(),
        source
    );
    fs::write(dir.0.join("nested.css"), format!("{source}\n")).unwrap();
    let changed = check();
    assert!(!changed.status.success());
    assert!(String::from_utf8_lossy(&changed.stderr).contains("stale"));
}

#[test]
fn migration_check_reports_imported_specificity_and_order_without_writing() {
    let dir = Temp::new();
    let entry = "@import 'nested.css';";
    let nested = ".a,#b{.child{color:red}} .button{@media (width >= 1024px){height:50px}@media (width >= 740px){height:40px}}";
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
fn migration_summary_groups_large_imported_reports_without_accepting_or_hiding_findings() {
    let dir = Temp::new();
    let nested: String = (0..600)
        .map(|i| format!(".a{i},#b{i}{{.child{{color:red}}}}\n"))
        .collect();
    fs::write(dir.0.join("app.css"), "@import 'nested.css';").unwrap();
    fs::write(dir.0.join("nested.css"), &nested).unwrap();
    let run = |extra: &[&str]| {
        dir.command()
            .args([
                "migrate",
                "app.css",
                "--from",
                "1.0.0-beta.16",
                "--color",
                "never",
            ])
            .args(extra)
            .output()
            .unwrap()
    };
    let summary = run(&["--summary"]);
    assert!(!summary.status.success());
    assert!(summary.stdout.is_empty());
    let text = String::from_utf8(summary.stderr).unwrap();
    assert!(text.contains("nested.css"));
    assert!(text.contains("600 items  EU_MIGRATION_SPECIFICITY (600 findings)"));
    assert!(text.contains("600 unresolved"));
    assert!(text.len() < 1500);

    let json = run(&["--json"]);
    assert!(!json.status.success());
    let mut report: serde_json::Value = serde_json::from_slice(&json.stdout).unwrap();
    assert_eq!(report["analysis_complete"], true);
    assert_eq!(report["findings"].as_array().unwrap().len(), 600);
    assert_eq!(report["findings"][599]["line"], 600);
    for finding in report["findings"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .take(599)
    {
        finding["accepted"] = true.into();
    }
    fs::write(dir.0.join("review.json"), report.to_string()).unwrap();
    let partial = run(&["--accept", "review.json", "--summary"]);
    assert!(!partial.status.success());
    let text = String::from_utf8(partial.stderr).unwrap();
    assert!(text.contains("1 item  EU_MIGRATION_SPECIFICITY (1 finding)"));
    assert!(text.contains("1 unresolved · 599 accepted"));
    assert!(!run(&["--summary", "--json"]).status.success());
    assert_eq!(
        fs::read_to_string(dir.0.join("nested.css")).unwrap(),
        nested
    );

    fs::write(dir.0.join("nested.css"), "@scope (.scope) {.a{color:red}}").unwrap();
    let incomplete = run(&["--summary"]);
    assert!(!incomplete.status.success());
    let text = String::from_utf8(incomplete.stderr).unwrap();
    assert!(text.contains("EU_MIGRATION_INCOMPLETE"));
    assert!(text.contains("Analysis incomplete"));
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

#[test]
fn bridge_uses_transform_source_and_returns_maps_dependencies_and_structured_errors() {
    let dir = Temp::new();
    let file = |name| dir.0.join(name).canonicalize().unwrap();
    fs::write(dir.0.join("app.css"), ".disk{color:red}").unwrap();
    fs::write(
        dir.0.join("child.css"),
        ".child{@space left negate(1/4) mobile}",
    )
    .unwrap();
    fs::write(
        dir.0.join("europa.json5"),
        "{theme:{breakpoints:{mobile:0},columns:{gutters:{'*':'20px'}}}}",
    )
    .unwrap();
    let run = |input: serde_json::Value| {
        let mut child = dir
            .command()
            .arg("bridge")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.to_string().as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.stderr.is_empty());
        let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        (output.status.success(), response)
    };
    let request = serde_json::json!({"version":1,"filename":file("app.css"),"source":"@import 'child.css'; .memory{color:blue}","config":file("europa.json5"),"browsers":["chrome 100"]});
    let (ok, response) = run(request.clone());
    assert!(ok, "{response}");
    let css = response["css"].as_str().unwrap();
    assert!(css.contains(".memory") && css.contains(".child") && !css.contains(".disk"));
    assert_eq!(response["map"]["sources"].as_array().unwrap().len(), 2);
    assert_eq!(response["dependencies"].as_array().unwrap().len(), 2);
    assert_eq!(response["watchFiles"].as_array().unwrap().len(), 3);
    assert_eq!(response["map"]["sourcesContent"][0], request["source"]);
    fs::write(file("child.css"), "@import 'missing.css';").unwrap();
    let (ok, response) = run(request.clone());
    assert!(!ok);
    assert_eq!(response["error"]["code"], "EU_IMPORT");
    assert_eq!(
        response["error"]["filename"],
        file("child.css").to_string_lossy().as_ref()
    );
    assert!(response["watchFiles"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p.as_str().unwrap().ends_with("missing.css")));
    let mut invalid = request;
    invalid["version"] = 2.into();
    let (ok, response) = run(invalid);
    assert!(!ok);
    assert_eq!(response["error"]["code"], "EU_BRIDGE");
}

#[test]
fn bridge_resolves_css_browser_policy_without_project_files_or_node() {
    let dir = Temp::new();
    let run = |request: serde_json::Value| {
        let mut child = dir
            .command()
            .args(["bridge", "targets"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(request.to_string().as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.stderr.is_empty());
        let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        (output.status.success(), response)
    };
    let (ok, response) = run(
        serde_json::json!({"version":1,"browsers":["chrome 110", "safari 15.6", "ios_saf 15.6"]}),
    );
    assert!(ok, "{response}");
    assert_eq!(
        response["targets"],
        serde_json::json!({"chrome":110<<16,"safari":(15<<16)|(6<<8),"ios_saf":(15<<16)|(6<<8)})
    );
    assert!(response["css"].is_null());
    assert!(response["watchFiles"].as_array().unwrap().is_empty());
    let (ok, defaults) = run(serde_json::json!({"version":1}));
    assert!(ok && defaults["targets"]["chrome"].is_number());
    let (ok, empty) = run(serde_json::json!({"version":1,"browsers":["chrome > 999"]}));
    assert!(ok && empty["targets"] == serde_json::json!({}));
    for request in [
        serde_json::json!({"version":2}),
        serde_json::json!({"version":1,"browsers":["unknown-browser"]}),
    ] {
        let (ok, response) = run(request);
        assert!(!ok && response["error"].is_object());
    }
}

#[test]
fn reviewed_appearance_edits_are_opt_in_and_reanalyzed_without_node() {
    let dir = Temp::new();
    fs::write(
        dir.0.join("europa.json5"),
        "{theme:{typography:{sizes:{body:{__base__:{'line-height':'150%'},md:'20px'}}}}}",
    )
    .unwrap();
    let source = ".x{@fontsize body md; line-height:normal;}";
    fs::write(dir.0.join("app.css"), source).unwrap();
    let base = [
        "migrate",
        "app.css",
        "--from",
        "1.0.0-beta.16",
        "--config",
        "europa.json5",
        "--json",
    ];
    let result = dir.command().args(base).output().unwrap();
    let mut review: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert!(review["findings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["fix"]["kind"] == "preserve-appearance"));
    fs::write(dir.0.join("review.json"), review.to_string()).unwrap();
    let run = || {
        dir.command()
            .args(base)
            .args(["--apply-fixes", "review.json"])
            .output()
            .unwrap()
    };
    assert!(!run().status.success());
    assert_eq!(fs::read_to_string(dir.0.join("app.css")).unwrap(), source);
    let syntax = dir.command().args(base).arg("--fix").output().unwrap();
    assert!(!syntax.status.success());
    assert_eq!(fs::read_to_string(dir.0.join("app.css")).unwrap(), source);
    for finding in review["findings"].as_array_mut().unwrap() {
        if finding["fix"]["kind"] == "preserve-appearance" {
            finding["apply_fix"] = true.into();
        }
    }
    fs::write(dir.0.join("review.json"), review.to_string()).unwrap();
    let result = run();
    assert!(
        !result.status.success(),
        "The boundary change still needs a fresh review after the source edit"
    );
    let report: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(report["fixed_files"], 1);
    assert_eq!(report["unresolved_findings"], 1);
    assert_eq!(report["findings"][0]["code"], "EU_MIGRATION_BREAKPOINT");
    assert_eq!(
        fs::read_to_string(dir.0.join("app.css")).unwrap(),
        ".x{line-height:normal; @fontsize body md;}"
    );
    assert!(
        !run().status.success(),
        "The old review must be stale after edits"
    );
}

#[test]
fn development_font_token_labels_are_opt_in_and_minification_removes_them() {
    let dir = Temp::new();
    fs::write(dir.0.join("input.css"), ".card { @fontsize base; }").unwrap();
    for (args, labels) in [
        (vec!["input.css"], false),
        (vec!["input.css", "--debug-tokens"], true),
        (vec!["input.css", "--debug-tokens", "--minify"], false),
    ] {
        let result = dir.command().args(args).output().unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let css = String::from_utf8(result.stdout).unwrap();
        assert_eq!(
            css.contains("/* --ec-font-token: \"typography.sizes.base\"; */"),
            labels
        );
        assert!(css.contains("font-size:"));
    }
}

#[test]
fn migration_groups_source_conflicts_keeps_full_evidence_and_labels_reviewed_fixes() {
    let dir = Temp::new();
    fs::write(
        dir.0.join("europa.json5"),
        "{theme:{typography:{sizes:{body:{__base__:{padding:'25px'},'*':'20px'}}}}}",
    )
    .unwrap();
    fs::write(
        dir.0.join("app.css"),
        "@import 'one.css'; @import 'two.css';",
    )
    .unwrap();
    let source = ".one {\n  @fontsize body;\n  padding:12px;\n}";
    fs::write(dir.0.join("one.css"), source).unwrap();
    fs::write(dir.0.join("two.css"), source.replace(".one", ".two")).unwrap();
    let run = |extra: &[&str]| {
        dir.command()
            .args([
                "migrate",
                "app.css",
                "--from",
                "1.0.0-beta.16",
                "--config",
                "europa.json5",
                "--color",
                "never",
            ])
            .args(extra)
            .output()
            .unwrap()
    };
    let grouped = run(&[]);
    assert!(!grouped.status.success());
    let text = String::from_utf8(grouped.stderr).unwrap();
    assert_eq!(
        text.matches("! warning [EU_MIGRATION_ORDER]").count(),
        2,
        "{text}"
    );
    assert_eq!(
        text.matches("4 comparisons at this source location")
            .count(),
        2,
        "{text}"
    );
    assert_eq!(
        text.matches("--apply <review.json> Move").count(),
        2,
        "{text}"
    );
    assert!(text.contains("2 distinct appearance edit proposals"));
    assert!(text.contains("padding-left: 25px → padding-left: 12px"));
    assert!(text.contains("within unconditional"));
    assert!(
        !text.contains("✗ error"),
        "Review findings must not look like a compiler failure"
    );
    assert!(!text.contains("--fix Move"));
    let detailed = String::from_utf8(run(&["--details"]).stderr).unwrap();
    assert_eq!(
        detailed.matches("! warning [EU_MIGRATION_ORDER]").count(),
        8
    );
    assert!(text.len() < detailed.len());
    let json = run(&["--json"]);
    assert!(json.stderr.is_empty());
    let mut report: serde_json::Value = serde_json::from_slice(&json.stdout).unwrap();
    let findings = report["findings"].as_array_mut().unwrap();
    let order: Vec<_> = findings
        .iter()
        .filter(|f| f["code"] == "EU_MIGRATION_ORDER")
        .collect();
    assert_eq!(order.len(), 8);
    assert!(order
        .iter()
        .all(|f| f["order"]["earlier_conditions"].is_array()));
    // Partial acceptance must remove only the chosen evidence, not its whole group.
    let first = findings
        .iter_mut()
        .find(|f| f["code"] == "EU_MIGRATION_ORDER")
        .unwrap();
    first["accepted"] = true.into();
    // Current-version reviews without presentation metadata remain valid.
    for finding in findings {
        finding.as_object_mut().unwrap().remove("order");
    }
    fs::write(dir.0.join("review.json"), report.to_string()).unwrap();
    let partial = run(&["--accept", "review.json"]);
    assert!(!partial.status.success());
    let partial = String::from_utf8(partial.stderr).unwrap();
    assert!(partial.contains("3 comparisons at this source location"));
    assert!(partial.contains("4 comparisons at this source location"));
    assert!(partial.contains("1 accepted"));
    for flags in [["--details", "--summary"], ["--details", "--json"]] {
        assert!(!run(&flags).status.success());
    }
    assert_eq!(fs::read_to_string(dir.0.join("one.css")).unwrap(), source);

    // The four comparisons in one item share one edit. Selecting all of them
    // must still apply that edit once and leave the other source untouched.
    let mut selected = 0;
    for finding in report["findings"].as_array_mut().unwrap() {
        finding["accepted"] = false.into();
        if finding["filename"].as_str().is_some_and(|name| {
            std::path::Path::new(name)
                .file_name()
                .is_some_and(|file| file == "one.css")
        }) && finding["fix"].is_object()
        {
            finding["apply_fix"] = true.into();
            selected += 1;
        }
    }
    assert_eq!(selected, 4);
    fs::write(dir.0.join("fixes.json"), report.to_string()).unwrap();
    let fixed = run(&["--apply", "fixes.json"]);
    assert!(!fixed.status.success());
    let fixed = String::from_utf8(fixed.stderr).unwrap();
    assert!(fixed.contains("1 file fixed"), "{fixed}");
    assert_eq!(fixed.matches("! warning [EU_MIGRATION_ORDER]").count(), 1);
    assert_eq!(
        fs::read_to_string(dir.0.join("one.css")).unwrap(),
        ".one {\n  padding:12px;\n  @fontsize body;\n}"
    );
    assert_eq!(
        fs::read_to_string(dir.0.join("two.css")).unwrap(),
        source.replace(".one", ".two")
    );
}

#[test]
fn migration_media_packing_config_is_inherited_and_keeps_reviews_scoped() {
    let dir = Temp::new();
    let source = ".x{width:160px}@media (max-width:1000px){.x{width:136px}}.x{width:176px}";
    fs::write(dir.0.join("app.css"), source).unwrap();
    fs::write(
        dir.0.join("preset.json5"),
        "{responsiveOrder:'generated-last',migration:{mediaPacking:'none'}}",
    )
    .unwrap();
    fs::write(dir.0.join("europa.json5"), "{extends:'./preset.json5'}").unwrap();
    let run = |extra: &[&str]| {
        dir.command()
            .args([
                "migrate",
                "app.css",
                "--from",
                "1.0.0-beta.6",
                "--config",
                "europa.json5",
                "--color",
                "never",
            ])
            .args(extra)
            .output()
            .unwrap()
    };
    let output = run(&["--json"]);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["assumptions"]["media_packing"], "none");
    assert_eq!(report["analysis_complete"], true);
    assert!(report["findings"].as_array().unwrap().is_empty());
    assert!(String::from_utf8_lossy(&run(&["--summary"]).stderr).contains("packing checks skipped"));
    fs::write(dir.0.join("review.json"), report.to_string()).unwrap();
    assert!(run(&["--accept", "review.json"]).status.success());
    fs::write(
        dir.0.join("europa.json5"),
        "{extends:'./preset.json5',migration:{mediaPacking:'assume'}}",
    )
    .unwrap();
    let output = run(&["--json"]);
    assert!(!output.status.success());
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["assumptions"]["media_packing"], "assume");
    assert_eq!(report["findings"].as_array().unwrap().len(), 1);
    let stale = run(&["--accept", "review.json"]);
    assert!(!stale.status.success());
    assert!(String::from_utf8_lossy(&stale.stderr).contains("stale"));
    assert_eq!(fs::read_to_string(dir.0.join("app.css")).unwrap(), source);
}

#[test]
fn migrate_config_prints_semantic_notices_and_preserves_custom_data() {
    let dir = Temp::new();
    fs::write(dir.0.join("old.cjs"), "module.exports={theme:{typography:{lineHeight:{mobile:1.3},\n  paddingDivider:8,sections:{nav:'12px'}}}};").unwrap();
    let output = dir
        .command()
        .args([
            "migrate-config",
            "old.cjs",
            "-o",
            "europa.json5",
            "--color",
            "never",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8_lossy(&output.stderr);
    assert_eq!(text.matches("EU_CONFIG_MIGRATION").count(), 1);
    assert!(text.contains("paddingDivider is deprecated"), "{text}");
    assert!(text.contains("old.cjs:2:3"), "{text}");
    assert!(text.contains("removed in EuropaCSS 0.2.0"), "{text}");
    assert!(!text.contains("theme.typography.lineHeight"), "{text}");
    assert!(!text.contains("theme.typography.sections"), "{text}");
    assert!(fs::read_to_string(dir.0.join("europa.json5"))
        .unwrap()
        .contains("paddingDivider"));
}
