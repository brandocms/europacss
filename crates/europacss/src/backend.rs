use crate::{sources::Sources, Error, Output, Request};
use lightningcss::{
    error::ErrorLocation,
    stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet},
    targets::{Browsers, Features, Targets},
};
use parcel_sourcemap::SourceMap;
use std::sync::{Arc, RwLock};

pub fn compile(request: &Request, frontend: Output, sources: &Sources) -> Result<Output, Error> {
    let mut original_map = frontend
        .map
        .as_deref()
        .map(|map| SourceMap::from_json("/", map))
        .transpose()
        .map_err(|e| Error::new("EU_SOURCE_MAP", e.to_string(), 0))?;
    let defaults = vec!["defaults".to_owned()];
    let browsers = if request.browsers.is_empty() {
        &defaults
    } else {
        &request.browsers
    };
    let targets = Targets {
        browsers: Browsers::from_browserslist(browsers)
            .map_err(|e| Error::new("EU_TARGETS", e.to_string(), 0).locate(&request.source))?,
        include: Features::Nesting,
        ..Targets::default()
    };
    let warnings = Arc::new(RwLock::new(Vec::new()));
    let mut sheet = StyleSheet::parse(
        &frontend.css,
        ParserOptions {
            filename: request.filename.clone(),
            warnings: Some(warnings.clone()),
            error_recovery: false,
            ..ParserOptions::default()
        },
    )
    .map_err(|e| {
        diagnostic(
            "EU_CSS",
            e.kind.to_string(),
            e.loc.as_ref(),
            &mut original_map,
            sources,
        )
    })?;
    sheet
        .minify(MinifyOptions {
            targets,
            ..MinifyOptions::default()
        })
        .map_err(|e| {
            diagnostic(
                "EU_CSS",
                e.kind.to_string(),
                e.loc.as_ref(),
                &mut original_map,
                sources,
            )
        })?;
    let mut map = request.source_map.then(|| SourceMap::new("/"));
    let printed = sheet
        .to_css(PrinterOptions {
            minify: request.minify,
            targets,
            source_map: map.as_mut(),
            ..PrinterOptions::default()
        })
        .map_err(|e| {
            diagnostic(
                "EU_CSS",
                e.kind.to_string(),
                e.loc.as_ref(),
                &mut original_map,
                sources,
            )
        })?;
    let map = if let Some(mut map) = map {
        if let Some(original) = &mut original_map {
            map.extends(original)
                .map_err(|e| Error::new("EU_SOURCE_MAP", e.to_string(), 0))?;
        }
        let json = map
            .to_json(None)
            .map_err(|e| Error::new("EU_SOURCE_MAP", e.to_string(), 0))?;
        let mut json: serde_json::Value = serde_json::from_str(&json)
            .map_err(|e| Error::new("EU_SOURCE_MAP", e.to_string(), 0))?;
        if let Some(names) = json["sources"].as_array_mut() {
            for name in names {
                if let Some(file) = sources.files.iter().find(|file| {
                    name.as_str().is_some_and(|name| {
                        file.name == name || file.name.strip_prefix('/') == Some(name)
                    })
                }) {
                    *name = file.name.clone().into();
                }
            }
        }
        Some(json.to_string())
    } else {
        None
    };
    let warnings = warnings
        .read()
        .unwrap()
        .iter()
        .map(|e| {
            diagnostic(
                "EU_CSS_WARNING",
                e.kind.to_string(),
                e.loc.as_ref(),
                &mut original_map,
                sources,
            )
        })
        .collect();
    Ok(Output {
        css: printed.code,
        map,
        warnings,
        dependencies: Vec::new(),
        watch: Vec::new(),
    })
}

fn diagnostic(
    code: &str,
    message: String,
    loc: Option<&ErrorLocation>,
    map: &mut Option<SourceMap>,
    sources: &Sources,
) -> Error {
    if let Some(original) = loc.and_then(|loc| {
        map.as_mut()?
            .find_closest_mapping(loc.line, loc.column.saturating_sub(1))?
            .original
    }) {
        let name = map
            .as_ref()
            .and_then(|map| map.get_source(original.source).ok())
            .unwrap_or("");
        return sources.mapped_error(
            code,
            message,
            name,
            original.original_line as usize,
            original.original_column as usize,
        );
    }
    sources.locate(Error::new(code, message, 0))
}
