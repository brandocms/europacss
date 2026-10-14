//! Versioned, single-request JSON transport for editor/build-tool adapters.
//! No Node bindings, daemon, temporary CSS, or generated output files.
use crate::{imports, Error};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub filename: PathBuf,
    /// The entry's current transform input; local imports still resolve on disk.
    pub source: Option<String>,
    pub config: Option<PathBuf>,
    #[serde(default)]
    pub browsers: Vec<String>,
    #[serde(default)]
    pub debug_tokens: bool,
    /// Ask the host to resolve imports that are not exact local files.
    #[serde(default)]
    pub resolve_imports: bool,
    #[serde(default)]
    pub resolutions: Vec<ImportResolution>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImportResolution {
    pub importer: PathBuf,
    pub specifier: String,
    pub filename: PathBuf,
}

#[derive(Debug, Serialize, Eq, PartialEq)]
pub struct ImportRequest {
    pub importer: PathBuf,
    pub specifier: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub version: u32,
    pub css: Option<String>,
    pub map: Option<serde_json::Value>,
    pub warnings: Vec<Error>,
    pub dependencies: Vec<String>,
    /// Includes logical aliases and attempted imports, even after a failed build.
    pub watch_files: Vec<PathBuf>,
    pub error: Option<Error>,
    /// Native Lightning CSS browser versions (major << 16 | minor << 8 | patch).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub targets: Option<BTreeMap<String, u32>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub resolve_imports: Vec<ImportRequest>,
}
impl Response {
    pub fn invalid(message: String) -> Self {
        Self {
            version: 1,
            css: None,
            map: None,
            warnings: Vec::new(),
            dependencies: Vec::new(),
            watch_files: Vec::new(),
            error: Some(Error::new("EU_BRIDGE", message, 0)),
            targets: None,
            resolve_imports: Vec::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetsRequest {
    pub version: u32,
    #[serde(default)]
    pub browsers: Vec<String>,
}

/// Resolve the policy without loading project CSS or configuration.
pub fn targets(request: TargetsRequest) -> Response {
    let mut response = Response::invalid(String::new());
    let result = (|| {
        if request.version != 1 {
            return Err(Error::new(
                "EU_BRIDGE",
                "Unsupported bridge protocol version",
                0,
            ));
        }
        let browsers = crate::backend::resolve_browsers(&request.browsers)?.unwrap_or_default();
        Ok([
            ("android", browsers.android),
            ("chrome", browsers.chrome),
            ("edge", browsers.edge),
            ("firefox", browsers.firefox),
            ("ie", browsers.ie),
            ("ios_saf", browsers.ios_saf),
            ("opera", browsers.opera),
            ("safari", browsers.safari),
            ("samsung", browsers.samsung),
        ]
        .into_iter()
        .filter_map(|(name, version)| version.map(|version| (name.to_owned(), version)))
        .collect())
    })();
    match result {
        Ok(targets) => {
            response.targets = Some(targets);
            response.error = None;
        }
        Err(error) => response.error = Some(error),
    }
    response
}

pub fn compile(request: Request) -> Response {
    let mut response = Response::invalid(String::new());
    let result = (|| {
        let invalid = |message| Error::new("EU_BRIDGE", message, 0);
        if request.version != 1 {
            return Err(invalid("Unsupported bridge protocol version"));
        }
        if !request.filename.is_absolute()
            || request
                .config
                .as_ref()
                .is_some_and(|path| !path.is_absolute())
        {
            return Err(invalid("Bridge filename and config paths must be absolute"));
        }
        if request.resolutions.len() > 4096
            || request
                .resolutions
                .iter()
                .any(|r| !r.importer.is_absolute() || !r.filename.is_absolute())
        {
            return Err(invalid(
                "Import resolutions must contain absolute paths and at most 4096 entries",
            ));
        }
        response.watch_files.push(request.filename.clone());
        let config = if let Some(path) = &request.config {
            crate::load_config_tracked(path, &mut response.watch_files)
                .map_err(|message| {
                    let mut error = Error::new("EU_CONFIG", message, 0);
                    error.filename = Some(path.to_string_lossy().into_owned());
                    error
                })?
                .value
        } else {
            crate::resolve_config(serde_json::json!({}))?
        };
        let compiler_request = crate::Request {
            filename: request.filename.to_string_lossy().into_owned(),
            config,
            source_map: true,
            debug_tokens: request.debug_tokens,
            browsers: request.browsers,
            ..Default::default()
        };
        let loaded = imports::load_resolved(
            Path::new(&request.filename),
            None,
            request.source.as_deref(),
            &mut response.watch_files,
            &request.resolutions,
            request
                .resolve_imports
                .then_some(&mut response.resolve_imports),
        )?;
        if !response.resolve_imports.is_empty() {
            return Ok(None);
        }
        crate::compile_loaded(&compiler_request, loaded).map(Some)
    })();
    response.watch_files.sort();
    response.watch_files.dedup();
    match result {
        Ok(Some(output)) => {
            response.css = Some(output.css);
            response.map = output
                .map
                .map(|map| serde_json::from_str(&map).expect("compiler source map"));
            response.warnings = output.warnings;
            response.dependencies = output.dependencies;
            response.error = None;
        }
        Ok(None) => response.error = None,
        Err(error) => response.error = Some(error),
    }
    response
}
