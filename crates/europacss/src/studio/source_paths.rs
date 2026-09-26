//! Authored property paths for editor/preview links, never stale byte offsets.
use serde_json::Value;
use std::collections::HashSet;

type Path = Vec<String>;
fn get<'a>(mut value: &'a Value, path: &[String]) -> Option<&'a Value> {
    for key in path {
        value = value.get(key)?;
    }
    Some(value)
}
fn lookup_path(value: &Value, name: &str) -> Option<Path> {
    // Same precedence as config::lookup, including literal slash keys.
    [
        name.split('.').map(String::from).collect::<Path>(),
        name.split('/').map(String::from).collect(),
    ]
    .into_iter()
    .find(|path| get(value, path).is_some())
}
fn origins(authored: &Value, path: &[String]) -> Vec<Path> {
    let mut candidates = Vec::new();
    let mut extension = vec!["theme".into(), "extend".into(), path[1].clone()];
    if let Some(value) = get(authored, &extension) {
        if path.len() == 2 {
            candidates.push(extension);
        } else if !value.is_object() || value.get(&path[2]).is_some() {
            extension.extend_from_slice(&path[2..]);
            candidates.push(extension);
        } else {
            candidates.push(path.to_vec());
        }
    } else {
        candidates.push(path.to_vec());
    }
    if path.len() == 2 {
        candidates.push(path.to_vec());
    }
    let mut out = Vec::new();
    for mut path in candidates {
        loop {
            if let Some(value) = get(authored, &path) {
                // A parent reference can supply an entire token subtree.
                if !out.contains(&path) && (path.len() >= 2) && !value.is_null() {
                    out.push(path);
                }
                break;
            }
            path.pop();
            if path.len() < 2 {
                break;
            }
            if get(authored, &path).is_some_and(|v| !v.is_string()) {
                break;
            }
        }
    }
    out
}
fn references(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(value) => {
            let mut rest = value.as_str();
            while let Some((_, tail)) = rest.split_once('{') {
                let Some((reference, tail)) = tail.split_once('}') else {
                    break;
                };
                out.push(reference.to_owned());
                rest = tail;
            }
        }
        Value::Array(values) => {
            for value in values {
                references(value, out);
            }
        }
        Value::Object(values) => {
            for value in values.values() {
                references(value, out);
            }
        }
        _ => {}
    }
}

pub(super) fn locate(
    authored: &Value,
    resolved: &Value,
    base: &[&str],
    name: Option<&str>,
) -> (Vec<Path>, Vec<Path>) {
    let mut path: Path = base.iter().map(|s| (*s).into()).collect();
    if let Some(name) = name {
        if let Some(tail) = get(resolved, &path).and_then(|v| lookup_path(v, name)) {
            path.extend(tail);
        }
    }
    let primary = origins(authored, &path);
    let mut dependencies = Vec::new();
    let mut pending = primary.clone();
    let mut seen = HashSet::new();
    while let Some(path) = pending.pop() {
        if seen.len() >= 512 || !seen.insert(path.clone()) {
            continue;
        }
        let Some(value) = get(authored, &path) else {
            continue;
        };
        let mut refs = Vec::new();
        references(value, &mut refs);
        for reference in refs {
            if let Some(mut path) = resolved
                .get("theme")
                .and_then(|v| lookup_path(v, &reference))
            {
                path.insert(0, "theme".into());
                for origin in origins(authored, &path) {
                    if !primary.contains(&origin) && !dependencies.contains(&origin) {
                        dependencies.push(origin.clone());
                    }
                    pending.push(origin);
                }
            }
        }
    }
    (primary, dependencies)
}
