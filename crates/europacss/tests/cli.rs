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
    assert!(String::from_utf8_lossy(&result.stderr).contains("input.css:2:2 [EU_LEGACY_SUFFIX]"));
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
