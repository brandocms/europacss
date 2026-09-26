use europacss::{compile, Request};
use std::{
    env, fs,
    io::{self, Read, Write},
    path::PathBuf,
    process::ExitCode,
};

const HELP: &str = "EuropaCSS experimental Rust compiler

Usage: europa <input.css|-> [-o output.css] [--config europa.toml]
              [--targets 'defaults'] [--minify] [--source-map]

With no -o option, CSS is written to stdout. Use - for stdin.
--source-map requires -o and writes an adjacent .map file.
--targets accepts a Browserslist query; the default is 'defaults'.
Configuration is TOML (or JSON for interchange); JavaScript is not executed.

Convert previously exported config data:
  europa migrate-config resolved.json -o europa.toml
";

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    if env::args().nth(1).as_deref() == Some("migrate-config") {
        args.next();
        let input = args
            .next()
            .ok_or("migrate-config requires exported JSON input")?;
        if args.next().as_deref() != Some("-o") {
            return Err("Usage: europa migrate-config resolved.json -o europa.toml".into());
        }
        let output = args.next().ok_or("-o requires a path")?;
        if args.next().is_some() {
            return Err("Unexpected argument after config output path".into());
        }
        let source = fs::read_to_string(&input).map_err(|e| format!("{input}: {e}"))?;
        let toml = europacss::json_to_toml(&source)?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|e| format!("{output}: {e}"))?;
        file.write_all(toml.as_bytes()).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let mut input = None;
    let mut output: Option<PathBuf> = None;
    let mut config_path = None;
    let mut browsers = Vec::new();
    let mut minify = false;
    let mut source_map = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                print!("{HELP}");
                return Ok(());
            }
            "--version" | "-V" => {
                println!("europa {} (experimental)", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            "--config" => config_path = Some(args.next().ok_or("--config needs a path")?),
            "-o" | "--output" => {
                output = Some(PathBuf::from(args.next().ok_or("--output needs a path")?))
            }
            "--targets" => browsers.push(args.next().ok_or("--targets needs a query")?),
            "--minify" => minify = true,
            "--source-map" => source_map = true,
            "-" => {
                if input.replace(arg).is_some() {
                    return Err("Only one input is supported".into());
                }
            }
            _ if arg.starts_with('-') => return Err(format!("Unknown option: {arg}")),
            _ => {
                if input.replace(arg).is_some() {
                    return Err("Only one input is supported".into());
                }
            }
        }
    }
    let input = input.ok_or_else(|| HELP.to_string())?;
    if source_map && output.is_none() {
        return Err("--source-map requires an output path (-o)".into());
    }
    let source = if input == "-" {
        let mut source = String::new();
        io::stdin()
            .read_to_string(&mut source)
            .map_err(|e| e.to_string())?;
        source
    } else {
        fs::read_to_string(&input).map_err(|e| format!("{input}: {e}"))?
    };
    let config = match config_path {
        Some(path) => europacss::load_config(&PathBuf::from(path))?,
        None => europacss::resolve_config(serde_json::json!({})).map_err(|e| e.to_string())?,
    };
    let filename = if input == "-" {
        "stdin.css".into()
    } else {
        input.clone()
    };
    let request = Request {
        source,
        filename: filename.clone(),
        config,
        source_map,
        minify,
        browsers,
    };
    let mut result = compile(&request).map_err(|e| format!("{filename}:{e}"))?;
    for warning in result.warnings {
        eprintln!("{filename}: warning: {warning}");
    }
    if let Some(output) = output {
        if input != "-" && output.canonicalize().ok() == fs::canonicalize(&input).ok() {
            return Err("Output must not overwrite the input stylesheet".into());
        }
        if let Some(map) = result.map {
            let mut map_path = output.as_os_str().to_owned();
            map_path.push(".map");
            let map_path = PathBuf::from(map_path);
            let mut map: serde_json::Value =
                serde_json::from_str(&map).map_err(|e| e.to_string())?;
            if input != "-" {
                let original = fs::canonicalize(&input).map_err(|e| e.to_string())?;
                let parent = output
                    .parent()
                    .filter(|p| !p.as_os_str().is_empty())
                    .unwrap_or_else(|| std::path::Path::new("."));
                let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
                let relative = pathdiff::diff_paths(&original, &parent).unwrap_or(original);
                map["sources"] = serde_json::json!([relative.to_string_lossy().replace('\\', "/")]);
            }
            fs::write(&map_path, map.to_string())
                .map_err(|e| format!("{}: {e}", map_path.display()))?;
            let name = map_path.file_name().unwrap().to_string_lossy();
            result
                .css
                .push_str(&format!("\n/*# sourceMappingURL={name} */\n"));
        }
        fs::write(&output, result.css).map_err(|e| format!("{}: {e}", output.display()))?;
    } else {
        io::stdout()
            .write_all(result.css.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}
