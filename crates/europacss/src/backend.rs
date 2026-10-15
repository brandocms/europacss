use crate::{sources::Sources, Error, Output, Request};
use lightningcss::{
    error::ErrorLocation,
    rules::CssRule,
    stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet},
    targets::{Browsers, Targets},
};
use parcel_sourcemap::SourceMap;
use std::sync::{Arc, RwLock};

pub(crate) fn resolve_browsers(queries: &[String]) -> Result<Option<Browsers>, Error> {
    let defaults = vec!["defaults".to_owned()];
    let queries = if queries.is_empty() {
        &defaults
    } else {
        queries
    };
    Browsers::from_browserslist(queries).map_err(|e| Error::new("EU_TARGETS", e.to_string(), 0))
}

pub fn compile(request: &Request, frontend: Output, sources: &Sources) -> Result<Output, Error> {
    let mut original_map = frontend
        .map
        .as_deref()
        .map(|map| SourceMap::from_json("/", map))
        .transpose()
        .map_err(|e| Error::new("EU_SOURCE_MAP", e.to_string(), 0))?;
    let targets = Targets {
        browsers: resolve_browsers(&request.browsers).map_err(|e| e.locate(&request.source))?,
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
    // Keep an authored leading layer-order prelude visibly intact. Lightning CSS
    // otherwise distributes its names among later blocks/statements. Retaining
    // the AST nodes also retains their original source-map locations.
    let layer_prelude: Vec<_> = sheet
        .rules
        .0
        .iter()
        .take_while(|rule| matches!(rule, CssRule::LayerStatement(_)))
        .cloned()
        .collect();
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
    if !layer_prelude.is_empty() {
        let names: Vec<_> = layer_prelude
            .iter()
            .flat_map(|rule| match rule {
                CssRule::LayerStatement(layer) => layer.names.clone(),
                _ => unreachable!(),
            })
            .collect();
        sheet.rules.0.retain(|rule| !matches!(rule, CssRule::LayerStatement(layer) if layer.names.iter().all(|name| names.contains(name))));
        sheet.rules.0.splice(0..0, layer_prelude);
    }
    let comments = request.debug_tokens && !request.minify;
    let mut map = (request.source_map || comments).then(|| SourceMap::new("/"));
    let mut printed = sheet
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
    if let (Some(map), Some(original)) = (&mut map, &mut original_map) {
        crate::provenance::refine(
            &frontend.css,
            &mut printed.code,
            map,
            original,
            targets,
            comments,
        );
    }
    if !request.source_map {
        map = None;
    }
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
                if let Some(index) = name.as_str().and_then(|name| sources.map_index(name)) {
                    *name = sources.files[index].name.clone().into();
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
