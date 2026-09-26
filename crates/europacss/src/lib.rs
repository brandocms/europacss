mod backend;
mod config;
mod config_file;
mod emit;
mod imports;
mod optimize;
pub mod parser;
mod size;
mod sources;
mod transform;
mod value_functions;
pub use config_file::{json_to_json5, load_config, resolve_config};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub source: String,
    pub filename: String,
    pub config: Value,
    #[serde(default)]
    pub source_map: bool,
    #[serde(default)]
    pub minify: bool,
    /// Browserslist queries evaluated in Rust. Empty means the `defaults` query.
    #[serde(default)]
    pub browsers: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Output {
    pub css: String,
    pub map: Option<String>,
    pub warnings: Vec<Error>,
    /// Canonical source paths in first-visit order; empty for in-memory compilation.
    pub dependencies: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Error {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    pub code: String,
    pub message: String,
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}
impl Error {
    pub fn new(code: &str, message: impl Into<String>, offset: usize) -> Self {
        Self {
            filename: None,
            code: code.into(),
            message: message.into(),
            offset,
            line: 0,
            column: 0,
        }
    }
    fn locate(mut self, source: &str) -> Self {
        let (line, column) = emit::position(source, self.offset.min(source.len()));
        self.line = line + 1;
        self.column = column + 1;
        self
    }
}

pub fn compile(request: &Request) -> Result<Output, Error> {
    // Keep internal mappings even when output maps are disabled, for backend diagnostics.
    let sources = single_source(request);
    let frontend = frontend(request, true, true)?;
    backend::compile(request, frontend, &sources)
}

/// Expand Europa syntax into standard CSS, preserving native nesting and source order.
pub fn compile_frontend(request: &Request) -> Result<Output, Error> {
    frontend(request, request.source_map, false)
}

fn frontend(request: &Request, source_map: bool, optimize: bool) -> Result<Output, Error> {
    (|| {
        let nodes = parser::parse(&request.source)?;
        imports::validate_external_order(&nodes)?;
        let config = config::Config::new(&request.config)?;
        let nodes = transform::transform(nodes, &config)?;
        let nodes = if optimize {
            optimize::media(nodes)
        } else {
            nodes
        };
        Ok(emit::emit(&nodes, &single_source(request), source_map))
    })()
    .map_err(|e: Error| e.locate(&request.source))
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}:{} [{}] {}",
            self.line, self.column, self.code, self.message
        )
    }
}
impl std::error::Error for Error {}

fn single_source(request: &Request) -> sources::Sources {
    let mut sources = sources::Sources::default();
    sources.add(request.filename.clone(), &request.source);
    sources
}

/// Compile a local stylesheet and its local imports. No network access or JS evaluation.
/// `request.source` must be empty; `request.filename` names the entry file.
/// Relative asset URLs target the output directory, or the entry directory when omitted.
pub fn compile_file(request: &Request, output: Option<&std::path::Path>) -> Result<Output, Error> {
    if !request.source.is_empty() {
        return Err(Error::new(
            "EU_INPUT",
            "compile_file reads filename; source must be empty",
            0,
        ));
    }
    let loaded = imports::load(std::path::Path::new(&request.filename), output)?;
    let result = (|| {
        let config = config::Config::new(&request.config)?;
        let mut nodes = transform::transform(loaded.nodes, &config)?;
        imports::rebase(&mut nodes, &loaded.sources, &loaded.output_dir)?;
        let nodes = optimize::media(nodes);
        let frontend = emit::emit(&nodes, &loaded.sources, true);
        let mut result = backend::compile(request, frontend, &loaded.sources)?;
        result.dependencies = loaded
            .sources
            .files
            .iter()
            .map(|file| file.name.clone())
            .collect();
        Ok(result)
    })();
    result.map_err(|error| loaded.sources.locate(error))
}
