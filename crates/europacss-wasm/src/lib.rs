//! EuropaCSS for browsers and other hosts without file access.
//!
//! One JSON request in, one JSON response out, through a raw linear-memory ABI.
//! The module has no imports: no wasm-bindgen glue, WASI, clock or network.
//! `packages/wasm` wraps the ABI for JavaScript.
use europacss::{config_from_json5, EmbedOptions, Error, ExternalUrls, Request};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Bumped when the request/response shape or exported functions change.
pub const ABI_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompileRequest {
    pub source: String,
    /// JSON5 text, as authored in `europa.json5`. Omitted means the built-in defaults.
    #[serde(default)]
    pub config: Option<String>,
    #[serde(default = "default_filename")]
    pub filename: String,
    #[serde(default = "default_config_filename")]
    pub config_filename: String,
    #[serde(default)]
    pub minify: bool,
    #[serde(default)]
    pub source_map: bool,
    #[serde(default)]
    pub debug_tokens: bool,
    /// Browserslist queries. Empty means `defaults`.
    #[serde(default)]
    pub browsers: Vec<String>,
    /// Compile the source as the body of this selector; rules outside it are errors.
    #[serde(default)]
    pub scope: Option<String>,
    /// `"allow"` (default), `"deny"`, or the hosts absolute URLs may name.
    #[serde(default)]
    pub external_urls: ExternalUrls,
}

fn default_filename() -> String {
    "input.css".into()
}

fn default_config_filename() -> String {
    "europa.json5".into()
}

#[derive(Debug, Serialize)]
pub struct CompileResponse {
    pub css: Option<String>,
    pub map: Option<Value>,
    pub warnings: Vec<Error>,
    /// `filename` names the config file for configuration errors.
    pub error: Option<Error>,
}

impl CompileResponse {
    fn failed(error: Error) -> Self {
        Self {
            css: None,
            map: None,
            warnings: Vec::new(),
            error: Some(error),
        }
    }
}

pub fn compile(request: CompileRequest) -> CompileResponse {
    let config_error = |mut error: Error| {
        error.filename = Some(request.config_filename.clone());
        CompileResponse::failed(error)
    };
    let config = match request.config.as_deref() {
        Some(source) => match config_from_json5(source) {
            Ok(config) => config,
            Err(error) => return config_error(error),
        },
        None => europacss::resolve_config(Value::Object(Default::default())).unwrap(),
    };
    let options = EmbedOptions {
        scope: request.scope,
        external_urls: request.external_urls,
    };
    let result = europacss::compile_with(
        &Request {
            source: request.source,
            filename: request.filename.clone(),
            config,
            source_map: request.source_map,
            minify: request.minify,
            debug_tokens: request.debug_tokens,
            browsers: request.browsers,
        },
        &options,
    );
    match result {
        Ok(output) => CompileResponse {
            css: Some(output.css),
            map: output.map.and_then(|map| serde_json::from_str(&map).ok()),
            warnings: output.warnings,
            error: None,
        },
        // Config validation runs during compilation and has no stylesheet location.
        Err(error) if error.code == "EU_CONFIG" => config_error(Error {
            line: 0,
            column: 0,
            ..error
        }),
        Err(mut error) => {
            error.filename.get_or_insert(request.filename);
            CompileResponse::failed(error)
        }
    }
}

/// Handle a JSON compile request. Malformed requests become `EU_REQUEST` errors.
pub fn compile_json(input: &[u8]) -> Vec<u8> {
    let response = match serde_json::from_slice::<CompileRequest>(input) {
        Ok(request) => compile(request),
        Err(error) => CompileResponse::failed(Error::new("EU_REQUEST", error.to_string(), 0)),
    };
    serde_json::to_vec(&response).unwrap()
}

/// Studio's token preview (breakpoints, colours, type and spacing specimens) for
/// JSON5 config text. Returns `{"preview": …}` or `{"error": "…"}`.
pub fn preview_json(config: &[u8]) -> Vec<u8> {
    let response = match std::str::from_utf8(config)
        .map_err(|e| e.to_string())
        .and_then(europacss::studio::preview)
    {
        Ok(preview) => serde_json::json!({ "preview": preview }),
        Err(error) => serde_json::json!({ "error": error }),
    };
    serde_json::to_vec(&response).unwrap()
}

/// The resolved config (defaults, `theme.extend` and `{…}` references applied) for
/// JSON5 text, e.g. for editor completions. Returns `{"config": …}` or `{"error": …}`.
pub fn resolve_json(config: &[u8]) -> Vec<u8> {
    let response = match std::str::from_utf8(config)
        .map_err(|e| Error::new("EU_REQUEST", e.to_string(), 0))
        .and_then(config_from_json5)
    {
        Ok(config) => serde_json::json!({ "config": config }),
        Err(error) => serde_json::json!({ "error": error }),
    };
    serde_json::to_vec(&response).unwrap()
}

pub fn version() -> &'static str {
    europacss::VERSION
}

#[cfg(target_arch = "wasm32")]
mod abi {
    //! Hosts write a request with `europa_alloc`, call an entry point, read
    //! `europa_result_len()` bytes at the returned pointer, then free both buffers.
    //! A panic traps; the instance must then be discarded.
    use std::cell::Cell;

    thread_local! {
        static RESULT_LEN: Cell<usize> = const { Cell::new(0) };
        static SEED: Cell<u64> = const { Cell::new(0x9e37_79b9_7f4a_7c15) };
    }

    fn respond(bytes: Vec<u8>) -> *mut u8 {
        let bytes = Box::leak(bytes.into_boxed_slice());
        RESULT_LEN.with(|len| len.set(bytes.len()));
        bytes.as_mut_ptr()
    }

    /// # Safety
    /// The caller owns the buffer and frees it with `europa_free(ptr, len)`.
    #[no_mangle]
    pub extern "C" fn europa_alloc(len: usize) -> *mut u8 {
        Box::leak(vec![0u8; len].into_boxed_slice()).as_mut_ptr()
    }

    /// # Safety
    /// `ptr`/`len` must come from `europa_alloc` or an entry point's result.
    #[no_mangle]
    pub unsafe extern "C" fn europa_free(ptr: *mut u8, len: usize) {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }

    #[no_mangle]
    pub extern "C" fn europa_result_len() -> usize {
        RESULT_LEN.with(Cell::get)
    }

    #[no_mangle]
    pub extern "C" fn europa_abi_version() -> u32 {
        super::ABI_VERSION
    }

    /// # Safety
    /// `ptr`/`len` must describe a live `europa_alloc` buffer.
    #[no_mangle]
    pub unsafe extern "C" fn europa_compile(ptr: *const u8, len: usize) -> *mut u8 {
        respond(super::compile_json(std::slice::from_raw_parts(ptr, len)))
    }

    /// # Safety
    /// `ptr`/`len` must describe a live `europa_alloc` buffer.
    #[no_mangle]
    pub unsafe extern "C" fn europa_preview(ptr: *const u8, len: usize) -> *mut u8 {
        respond(super::preview_json(std::slice::from_raw_parts(ptr, len)))
    }

    /// # Safety
    /// `ptr`/`len` must describe a live `europa_alloc` buffer.
    #[no_mangle]
    pub unsafe extern "C" fn europa_resolve(ptr: *const u8, len: usize) -> *mut u8 {
        respond(super::resolve_json(std::slice::from_raw_parts(ptr, len)))
    }

    #[no_mangle]
    pub extern "C" fn europa_version() -> *mut u8 {
        respond(super::version().as_bytes().to_vec())
    }

    /// ahash only needs per-process hash seeds, not secrets. A deterministic
    /// xorshift keeps the module free of host imports and its output reproducible.
    ///
    /// # Safety
    /// Called by getrandom with a writable `dest` of `len` bytes.
    #[no_mangle]
    unsafe extern "Rust" fn __getrandom_v03_custom(
        dest: *mut u8,
        len: usize,
    ) -> Result<(), getrandom::Error> {
        SEED.with(|seed| {
            for i in 0..len {
                let mut x = seed.get();
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                seed.set(x);
                *dest.add(i) = (x >> 24) as u8;
            }
        });
        Ok(())
    }
}
