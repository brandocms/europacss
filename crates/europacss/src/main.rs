mod cli_compare;
mod cli_migration;
mod cli_output;
mod cli_review;
mod cli_studio;
mod cli_watch;
use cli_output::{Build, Color, Ui};
use europacss::{compile, compile_file, watch::Snapshot, Request};
use std::{
    env, fs,
    io::{self, Read, Write},
    path::PathBuf,
    process::ExitCode,
    time::Instant,
};

fn run(args: Vec<String>, ui: &Ui, color: Color) -> Result<Vec<Snapshot>, String> {
    let started = Instant::now();
    let build_args: Vec<_> = args
        .iter()
        .filter(|arg| arg.as_str() != "--watch")
        .cloned()
        .collect();
    let mut args = args.into_iter().peekable();
    if args.peek().map(String::as_str) == Some("studio") {
        args.next();
        return cli_studio::run(args.collect(), ui).map(|_| Vec::new());
    }
    if args.peek().map(String::as_str) == Some("migrate-config") {
        args.next();
        let input = args
            .next()
            .ok_or("migrate-config requires JSON/JSON5 data or a static JavaScript config")?;
        if args.next().as_deref() != Some("-o") {
            return Err("Usage: europa migrate-config europa.config.cjs -o europa.json5".into());
        }
        let output = args.next().ok_or("-o requires a path")?;
        if args.next().is_some() {
            return Err("Unexpected argument after config output path".into());
        }
        let source = fs::read_to_string(&input).map_err(|e| format!("{input}: {e}"))?;
        let extension = std::path::Path::new(&input)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let converted = europacss::migrate_config_report(&source, extension)
            .map_err(|e| format!("{input}: {e}"))?;
        for warning in &converted.diagnostics {
            eprint!("{}", ui.diagnostic(warning, &input, Some(&source), true));
        }
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|e| format!("{output}: {e}"))?;
        file.write_all(converted.source.as_bytes())
            .map_err(|e| e.to_string())?;
        ui.migrated(&output);
        return Ok(Vec::new());
    }
    let mut input = None;
    let mut output: Option<PathBuf> = None;
    let mut config_path = None;
    let mut browsers = Vec::new();
    let mut minify = false;
    let mut source_map = false;
    let mut debug_tokens = false;
    let mut watch = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                print!("{}", Ui::stdout(color).help());
                return Ok(Vec::new());
            }
            "--version" | "-V" => {
                println!("europa {} (experimental)", env!("CARGO_PKG_VERSION"));
                return Ok(Vec::new());
            }
            "--config" => config_path = Some(args.next().ok_or("--config needs a path")?),
            "-o" | "--output" => {
                output = Some(PathBuf::from(args.next().ok_or("--output needs a path")?))
            }
            "--targets" => browsers.push(args.next().ok_or("--targets needs a query")?),
            "--minify" => minify = true,
            "--source-map" => source_map = true,
            "--debug-tokens" => debug_tokens = true,
            "--watch" => watch = true,
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
    let input = input
        .ok_or("Provide an input stylesheet or - for stdin. Run europa --help for examples.")?;
    if source_map && output.is_none() {
        return Err("--source-map requires an output path (-o)".into());
    }
    if watch {
        if input == "-" || output.is_none() {
            return Err("--watch requires an input file and output path (-o); stdin/stdout builds cannot be watched".into());
        }
        cli_watch::run(|| run(build_args.clone(), ui, color), ui);
    }
    let source = if input == "-" {
        let mut source = String::new();
        io::stdin()
            .read_to_string(&mut source)
            .map_err(|e| e.to_string())?;
        source
    } else {
        String::new()
    };
    let loaded_config = config_path
        .as_ref()
        .map(|path| europacss::load_config_tracked(std::path::Path::new(path), &mut Vec::new()))
        .transpose()?;
    let config = match &loaded_config {
        Some(loaded) => loaded.value.clone(),
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
        debug_tokens,
        minify,
        browsers,
    };
    let mut result = if input == "-" {
        compile(&request)
    } else {
        compile_file(&request, output.as_deref())
    }
    .map_err(|e| {
        ui.diagnostic(
            &e,
            &filename,
            (input == "-").then_some(request.source.as_str()),
            false,
        )
    })?;
    if let Some(loaded) = &loaded_config {
        result.watch.extend(loaded.watch.clone());
    }
    let warning_count = result.warnings.len();
    for warning in &result.warnings {
        eprint!(
            "{}",
            ui.diagnostic(
                warning,
                &filename,
                (input == "-").then_some(request.source.as_str()),
                true
            )
        );
    }
    let destination = output
        .as_ref()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "stdout".into());
    if let Some(output) = output {
        let mut protected: Vec<PathBuf> = result.dependencies.iter().map(PathBuf::from).collect();
        if let Some(loaded) = loaded_config {
            protected.extend(loaded.dependencies);
        }
        let mut map_path = output.as_os_str().to_owned();
        map_path.push(".map");
        let map_path = PathBuf::from(map_path);
        for target in std::iter::once(&output).chain(source_map.then_some(&map_path)) {
            if target
                .canonicalize()
                .ok()
                .is_some_and(|path| protected.contains(&path))
            {
                return Err("Output must not overwrite an input stylesheet, imported dependency, or config file".into());
            }
        }
        if let Some(map) = result.map {
            let mut map: serde_json::Value =
                serde_json::from_str(&map).map_err(|e| e.to_string())?;
            if input != "-" {
                let parent = output
                    .parent()
                    .filter(|p| !p.as_os_str().is_empty())
                    .unwrap_or_else(|| std::path::Path::new("."));
                let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
                if let Some(sources) = map["sources"].as_array_mut() {
                    for source in sources {
                        let original =
                            PathBuf::from(source.as_str().ok_or("Invalid source map path")?);
                        let relative = pathdiff::diff_paths(&original, &parent).unwrap_or(original);
                        *source = relative.to_string_lossy().replace('\\', "/").into();
                    }
                }
            }
            fs::write(&map_path, map.to_string())
                .map_err(|e| format!("{}: {e}", map_path.display()))?;
            let name = map_path.file_name().unwrap().to_string_lossy();
            result
                .css
                .push_str(&format!("\n/*# sourceMappingURL={name} */\n"));
        }
        fs::write(&output, &result.css).map_err(|e| format!("{}: {e}", output.display()))?;
    } else {
        io::stdout()
            .write_all(result.css.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    ui.built(Build {
        input: if input == "-" { "stdin" } else { &input },
        output: &destination,
        bytes: result.css.len(),
        files: result.dependencies.len().max(1),
        map: source_map,
        minify,
        warnings: warning_count,
        elapsed: started.elapsed(),
    });
    Ok(result.watch)
}

fn options() -> Result<(Vec<String>, Color, bool), String> {
    let mut args = env::args().skip(1);
    let mut rest = Vec::new();
    let mut color = Color::Auto;
    let mut quiet = false;
    while let Some(arg) = args.next() {
        if arg == "--color" {
            color = Color::parse(
                &args
                    .next()
                    .ok_or("--color needs a mode: auto, always, or never")?,
            )?;
        } else if let Some(value) = arg.strip_prefix("--color=") {
            color = Color::parse(value)?;
        } else if arg == "--quiet" || arg == "-q" {
            quiet = true;
        } else {
            rest.push(arg);
        }
    }
    Ok((rest, color, quiet))
}

fn main() -> ExitCode {
    let (args, color, quiet) = match options() {
        Ok(options) => options,
        Err(message) => {
            eprintln!("{}", Ui::stderr(Color::Auto, false).failure(&message));
            return ExitCode::FAILURE;
        }
    };
    if args.first().map(String::as_str) == Some("bridge") {
        let response = (|| {
            let targets_only = args.len() == 2 && args[1] == "targets";
            if args.len() != 1 && !targets_only {
                return Err("bridge [targets] takes one JSON request on stdin".to_string());
            }
            let mut input = String::new();
            io::stdin()
                .take(16 * 1024 * 1024 + 1)
                .read_to_string(&mut input)
                .map_err(|e| e.to_string())?;
            if input.len() > 16 * 1024 * 1024 {
                return Err("Bridge request exceeds 16 MiB".into());
            }
            if targets_only {
                let request = serde_json::from_str(&input).map_err(|e| e.to_string())?;
                Ok(europacss::bridge::targets(request))
            } else {
                let request = serde_json::from_str(&input).map_err(|e| e.to_string())?;
                Ok(europacss::bridge::compile(request))
            }
        })()
        .unwrap_or_else(europacss::bridge::Response::invalid);
        println!("{}", serde_json::to_string(&response).unwrap());
        return if response.error.is_some() {
            ExitCode::FAILURE
        } else {
            ExitCode::SUCCESS
        };
    }
    let ui = Ui::stderr(color, quiet);
    if args.first().map(String::as_str) == Some("compare") {
        return match cli_compare::run(args.into_iter().skip(1).collect()) {
            Ok(status) => status,
            Err(message) => {
                ui.error(&message);
                ExitCode::from(2)
            }
        };
    }
    if args.first().map(String::as_str) == Some("migrate") {
        return match cli_migration::run(args.into_iter().skip(1).collect(), &ui) {
            Ok(status) => status,
            Err(message) => {
                ui.error(&message);
                ExitCode::FAILURE
            }
        };
    }
    match run(args, &ui, color) {
        Ok(_) => ExitCode::SUCCESS,
        Err(message) => {
            ui.error(&message);
            ExitCode::FAILURE
        }
    }
}
