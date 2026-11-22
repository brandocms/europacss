//! Data-only CSS package resolution. Vite continues to own its host resolution.
use crate::Error;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn resolve(
    importer: &Path,
    specifier: &str,
    metadata: &mut BTreeMap<PathBuf, String>,
    watched: &mut Vec<PathBuf>,
    offset: usize,
) -> Result<Option<PathBuf>, Error> {
    if specifier.starts_with(['.', '/', '#']) || specifier.contains(['\\', ':']) {
        return Ok(None);
    }
    let parts: Vec<_> = specifier.split('/').collect();
    let count = if specifier.starts_with('@') { 2 } else { 1 };
    if parts.len() < count
        || parts
            .iter()
            .any(|p| p.is_empty() || matches!(*p, "." | ".." | "node_modules"))
    {
        return Ok(None);
    }
    let name = parts[..count].join("/");
    let subpath = if parts.len() == count {
        ".".into()
    } else {
        format!("./{}", parts[count..].join("/"))
    };
    let fail = |message: String| Error::new("EU_IMPORT_PACKAGE", message, offset);
    for parent in importer.parent().unwrap().ancestors() {
        let directory = parent.join("node_modules").join(&name);
        let manifest = directory.join("package.json");
        watched.push(manifest.clone());
        if !directory.is_dir() {
            continue;
        }
        let package = if manifest.is_file() {
            let source = fs::read_to_string(&manifest)
                .map_err(|e| fail(format!("{}: {e}", manifest.display())))?;
            if source.len() > 1024 * 1024 {
                return Err(fail("Package manifest exceeds 1 MiB".into()));
            }
            let value: Value = serde_json::from_str(&source)
                .map_err(|e| fail(format!("{}: {e}", manifest.display())))?;
            metadata.insert(manifest, source);
            value
        } else {
            Value::Null
        };
        let target = if let Some(exports) = package.get("exports") {
            export(exports, &subpath).map_err(|e| fail(format!("{name}: {e}")))?
                .ok_or_else(|| fail(format!("Package {name} does not export {subpath} for CSS (style/browser/import/default conditions)")))?
        } else if subpath != "." {
            subpath.clone()
        } else {
            package
                .get("style")
                .and_then(Value::as_str)
                .unwrap_or("./index.css")
                .to_owned()
        };
        let target = target.strip_prefix("./").unwrap_or(&target);
        if !safe_target(target) {
            return Err(fail(format!(
                "Invalid CSS package target {target:?} in {name}"
            )));
        }
        return Ok(Some(directory.join(target)));
    }
    Ok(None)
}

fn safe_target(target: &str) -> bool {
    !target.is_empty()
        && !target.contains(['\\', ':', '%', '?', '#'])
        && target
            .split('/')
            .all(|part| !matches!(part, "" | "." | ".." | "node_modules"))
}

fn export(value: &Value, subpath: &str) -> Result<Option<String>, String> {
    if let Some(object) = value.as_object() {
        let paths = object.keys().any(|key| key.starts_with('.'));
        if paths {
            if object.keys().any(|key| !key.starts_with('.')) {
                return Err("exports mixes conditions and subpaths".into());
            }
            if let Some(exact) = object.get(subpath) {
                return target(exact, None);
            }
            let mut patterns: Vec<_> = object
                .iter()
                .filter_map(|(key, value)| {
                    let (prefix, suffix) = key.split_once('*')?;
                    if suffix.contains('*') {
                        return None;
                    }
                    let middle = subpath.strip_prefix(prefix)?.strip_suffix(suffix)?;
                    Some((prefix.len(), key.len(), value, middle))
                })
                .collect();
            patterns.sort_by_key(|(prefix, length, _, _)| std::cmp::Reverse((*prefix, *length)));
            return patterns.first().map_or(Ok(None), |(_, _, value, middle)| {
                target(value, Some(middle))
            });
        }
    }
    if subpath == "." {
        target(value, None)
    } else {
        Ok(None)
    }
}

fn target(value: &Value, capture: Option<&str>) -> Result<Option<String>, String> {
    match value {
        Value::String(value) => {
            let value = capture.map_or_else(|| value.clone(), |c| value.replace('*', c));
            let path = value
                .strip_prefix("./")
                .filter(|path| safe_target(path))
                .ok_or_else(|| {
                    format!("Invalid exports target {value:?}; expected a path inside the package")
                })?;
            Ok(Some(format!("./{path}")))
        }
        Value::Null => Ok(None),
        Value::Object(conditions) => {
            for (condition, value) in conditions {
                if matches!(
                    condition.as_str(),
                    "style" | "browser" | "import" | "default"
                ) {
                    // An explicit null blocks this branch; do not fall through it.
                    if value.is_null() {
                        return Ok(None);
                    }
                    if let Some(path) = target(value, capture)? {
                        return Ok(Some(path));
                    }
                }
            }
            Ok(None)
        }
        Value::Array(alternatives) => {
            let mut error = None;
            for value in alternatives {
                match target(value, capture) {
                    Ok(Some(path)) => return Ok(Some(path)),
                    Ok(None) if value.is_null() => error = None,
                    Ok(None) => {}
                    Err(e) => error = Some(e),
                }
            }
            error.map_or(Ok(None), Err)
        }
        _ => Err("Unsupported exports target".into()),
    }
}
