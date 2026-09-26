mod backend;
mod config;
mod config_file;
mod emit;
pub mod parser;
mod transform;
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
}

#[derive(Clone, Debug, Serialize)]
pub struct Error {
    pub code: String,
    pub message: String,
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}
impl Error {
    pub fn new(code: &str, message: impl Into<String>, offset: usize) -> Self {
        Self {
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
    let frontend = frontend(request, true)?;
    backend::compile(request, frontend)
}

/// Expand Europa syntax into standard CSS, preserving native nesting and source order.
pub fn compile_frontend(request: &Request) -> Result<Output, Error> {
    frontend(request, request.source_map)
}

fn frontend(request: &Request, source_map: bool) -> Result<Output, Error> {
    (|| {
        let nodes = parser::parse(&request.source)?;
        let config = config::Config::new(&request.config)?;
        let nodes = transform::transform(nodes, &config)?;
        Ok(emit::emit(&nodes, request, source_map))
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
