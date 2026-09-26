use crate::{
    config::{lookup, scalar},
    Error,
};
use serde_json::{Map, Value};
use std::{collections::HashMap, fs, path::Path};

pub fn load_config(path: &Path) -> Result<Value, String> {
    let source = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let value = match path.extension().and_then(|s| s.to_str()) {
        Some("toml") => toml::from_str::<Value>(&source).map_err(|e| e.to_string()),
        Some("json") => serde_json::from_str(&source).map_err(|e| e.to_string()),
        _ => Err(
            "Expected .toml or .json config; JavaScript configuration must be migrated first"
                .into(),
        ),
    }
    .map_err(|e| format!("{}: {e}", path.display()))?;
    resolve_config(value).map_err(|e| format!("{}: {}", path.display(), e.message))
}

/// Convert already exported data to TOML. This does not evaluate JavaScript callbacks.
pub fn json_to_toml(source: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(source).map_err(|e| e.to_string())?;
    resolve_config(value.clone()).map_err(|e| e.message)?;
    toml::to_string_pretty(&value).map_err(|e| format!("Cannot represent this config in TOML: {e}"))
}

/// Preserve existing defaults and theme-section replacement, then apply theme.extend.
/// Reference resolution is data-only; it preserves arrays/objects for full references.
pub fn resolve_config(input: Value) -> Result<Value, Error> {
    let err = |message| Error::new("EU_CONFIG", message, 0);
    let input = input
        .as_object()
        .ok_or_else(|| err("Configuration must be an object"))?;
    let mut result: Value = serde_json::from_str(include_str!("../default-config.json")).unwrap();
    let root = result.as_object_mut().unwrap();
    for (key, value) in input {
        if key != "theme" {
            root.insert(key.clone(), value.clone());
        }
    }
    let theme = root.get_mut("theme").unwrap().as_object_mut().unwrap();
    if let Some(input) = input.get("theme") {
        let input = input
            .as_object()
            .ok_or_else(|| err("theme must be an object"))?;
        for (key, value) in input {
            if key != "extend" {
                theme.insert(key.clone(), value.clone());
            }
        }
        if let Some(extend) = input.get("extend") {
            for (key, extension) in extend
                .as_object()
                .ok_or_else(|| err("theme.extend must be an object"))?
            {
                match (theme.get_mut(key), extension.as_object()) {
                    (Some(Value::Object(current)), Some(extension)) => {
                        current.extend(extension.clone())
                    }
                    _ => {
                        theme.insert(key.clone(), extension.clone());
                    }
                }
            }
        }
    }
    let snapshot = Value::Object(theme.clone());
    let mut resolver = References {
        root: &snapshot,
        stack: Vec::new(),
        cache: HashMap::new(),
        visits: 0,
    };
    root.insert("theme".into(), resolver.value(&snapshot, "theme", 0)?);
    Ok(result)
}

struct References<'a> {
    root: &'a Value,
    stack: Vec<String>,
    cache: HashMap<String, Value>,
    visits: usize,
}
impl References<'_> {
    fn reference(&mut self, path: &str, from: &str, depth: usize) -> Result<Value, Error> {
        if self.stack.iter().any(|s| s == path) {
            return Err(Error::new(
                "EU_CONFIG",
                format!("Cyclic token reference `{{{path}}}` from `{from}`"),
                0,
            ));
        }
        if let Some(value) = self.cache.get(path) {
            return Ok(value.clone());
        }
        let raw = lookup(self.root, path).ok_or_else(|| {
            Error::new(
                "EU_CONFIG",
                format!("Unknown token reference `{{{path}}}` from `{from}`"),
                0,
            )
        })?;
        self.stack.push(path.into());
        let value = self.value(raw, path, depth + 1)?;
        self.stack.pop();
        self.cache.insert(path.into(), value.clone());
        Ok(value)
    }
    fn value(&mut self, value: &Value, from: &str, depth: usize) -> Result<Value, Error> {
        self.visits += 1;
        if depth > 128 || self.visits > 100_000 {
            return Err(Error::new(
                "EU_CONFIG",
                "Config reference expansion limit exceeded",
                0,
            ));
        }
        match value {
            Value::String(s) => {
                if let Some(path) = s.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                    if !path.contains(['{', '}']) {
                        return self.reference(path, from, depth);
                    }
                }
                let mut result = String::new();
                let mut rest = s.as_str();
                while let Some(start) = rest.find('{') {
                    let Some(end) = rest[start + 1..].find('}').map(|i| start + 1 + i) else {
                        break;
                    };
                    result.push_str(&rest[..start]);
                    let path = &rest[start + 1..end];
                    let value = self.reference(path, from, depth)?;
                    result.push_str(&scalar(&value).ok_or_else(|| {
                        Error::new(
                            "EU_CONFIG",
                            format!("Cannot interpolate non-scalar `{{{path}}}` into `{from}`"),
                            0,
                        )
                    })?);
                    rest = &rest[end + 1..];
                }
                result.push_str(rest);
                Ok(Value::String(result))
            }
            Value::Array(values) => values
                .iter()
                .enumerate()
                .map(|(i, value)| self.value(value, &format!("{from}[{i}]"), depth + 1))
                .collect::<Result<Vec<_>, _>>()
                .map(Value::Array),
            Value::Object(values) => values
                .iter()
                .map(|(key, value)| {
                    Ok((
                        key.clone(),
                        self.value(value, &format!("{from}.{key}"), depth + 1)?,
                    ))
                })
                .collect::<Result<Map<_, _>, _>>()
                .map(Value::Object),
            _ => Ok(value.clone()),
        }
    }
}
