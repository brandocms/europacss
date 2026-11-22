use crate::{
    config::{lookup, scalar},
    Error,
};
use serde::{
    de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use serde_json::{Map, Number, Value};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

/// Resolved configuration and every file observed while loading its inheritance chain.
#[derive(Debug)]
pub struct LoadedConfig {
    pub value: Value,
    /// Canonical paths, starting with the entry config.
    pub dependencies: Vec<PathBuf>,
    /// Content snapshots, including symlink aliases, for watch-mode rebuilds.
    pub watch: Vec<crate::watch::Snapshot>,
}

pub fn load_config(path: &Path) -> Result<Value, String> {
    load_config_tracked(path, &mut Vec::new()).map(|loaded| loaded.value)
}

/// `watched` also receives attempted paths on failure, so a missing parent can recover.
pub fn load_config_tracked(
    path: &Path,
    watched: &mut Vec<PathBuf>,
) -> Result<LoadedConfig, String> {
    let raw = load_raw(path, None, watched)?;
    Ok(LoadedConfig {
        value: resolve_config(raw.value)
            .map_err(|e| format!("{}: {}", path.display(), e.message))?,
        dependencies: raw.dependencies,
        watch: raw.watch,
    })
}

fn parse_config(source: &str, path: &Path) -> Result<Value, String> {
    let value = match path.extension().and_then(|s| s.to_str()) {
        Some("json5") => json5::from_str::<ConfigValue>(source).map_err(|e| e.to_string()),
        Some("json") => serde_json::from_str::<ConfigValue>(source).map_err(|e| e.to_string()),
        _ => Err(
            "Expected .json5 or .json config; JavaScript configuration must be migrated first"
                .into(),
        ),
    }
    .map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(value.0)
}

fn take_extends(value: &mut Value) -> Result<Option<String>, String> {
    let object = value
        .as_object_mut()
        .ok_or("Configuration must be an object")?;
    match object.remove("extends") {
        None => Ok(None),
        Some(Value::String(path)) if !path.trim().is_empty() => Ok(Some(path)),
        _ => Err("extends must be a nonempty path to one .json5 or .json file".into()),
    }
}

/// Objects merge recursively; every other child value (including arrays/null) replaces.
fn inherit(parent: &mut Value, child: Value) {
    match (parent, child) {
        (Value::Object(parent), Value::Object(child)) => {
            for (key, value) in child {
                match parent.get_mut(&key) {
                    Some(previous) => inherit(previous, value),
                    None => {
                        parent.insert(key, value);
                    }
                }
            }
        }
        (parent, child) => *parent = child,
    }
}

#[derive(Default)]
pub(crate) struct Inheritance {
    parent: Value,
    extends: Option<String>,
}

impl Inheritance {
    pub(crate) fn has_parent(&self) -> bool {
        self.extends.is_some()
    }

    /// Studio can edit the child while keeping file access bound to the startup config.
    pub(crate) fn resolve(&self, mut child: Value) -> Result<Value, String> {
        if take_extends(&mut child)? != self.extends {
            return Err("Changing extends in Studio requires restarting with --config; inherited files are selected at startup".into());
        }
        let mut merged = self.parent.clone();
        inherit(&mut merged, child);
        resolve_config(merged).map_err(|e| e.to_string())
    }
}

pub(crate) struct RawConfig {
    value: Value,
    pub inheritance: Inheritance,
    dependencies: Vec<PathBuf>,
    watch: Vec<crate::watch::Snapshot>,
}

pub(crate) fn load_raw(
    path: &Path,
    source: Option<&str>,
    watched: &mut Vec<PathBuf>,
) -> Result<RawConfig, String> {
    struct Loader<'a> {
        watched: &'a mut Vec<PathBuf>,
        dependencies: Vec<PathBuf>,
        watch: Vec<crate::watch::Snapshot>,
        stack: Vec<PathBuf>,
        bytes: usize,
        inheritance: Inheritance,
    }
    impl Loader<'_> {
        fn file(&mut self, path: &Path, source: Option<&str>) -> Result<Value, String> {
            let path = if path.is_absolute() {
                path.to_path_buf()
            } else {
                std::env::current_dir()
                    .map_err(|e| e.to_string())?
                    .join(path)
            };
            self.watched.push(path.clone());
            let canonical =
                fs::canonicalize(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            self.watched.push(canonical.clone());
            if self.stack.contains(&canonical) {
                let chain = self
                    .stack
                    .iter()
                    .chain(std::iter::once(&canonical))
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(" -> ");
                return Err(format!("Cyclic config inheritance: {chain}"));
            }
            if self.stack.len() >= 64 {
                return Err("Config inheritance limit exceeded (64 files)".into());
            }
            const MAX_BYTES: usize = 8 * 1024 * 1024;
            let source = match source {
                Some(source) => source.to_owned(),
                None => {
                    let mut source = String::new();
                    fs::File::open(&canonical)
                        .and_then(|file| {
                            file.take((MAX_BYTES - self.bytes + 1) as u64)
                                .read_to_string(&mut source)
                        })
                        .map_err(|e| format!("{}: {e}", canonical.display()))?;
                    source
                }
            };
            self.bytes += source.len();
            if self.bytes > MAX_BYTES {
                return Err("Config inheritance size limit exceeded (8 MiB total)".into());
            }
            let snapshot =
                crate::watch::Snapshot::from_source(canonical.clone(), source.as_bytes());
            if path != canonical {
                self.watch.push(snapshot.clone().at_path(path));
            }
            self.watch.push(snapshot);
            self.dependencies.push(canonical.clone());
            let mut child = parse_config(&source, &canonical)?;
            let extends =
                take_extends(&mut child).map_err(|e| format!("{}: {e}", canonical.display()))?;
            self.stack.push(canonical.clone());
            let mut parent = match &extends {
                Some(parent) => self
                    .file(&canonical.parent().unwrap().join(parent), None)
                    .map_err(|e| format!("{} extends {parent:?}:\n{e}", canonical.display()))?,
                None => Value::Object(Map::new()),
            };
            self.stack.pop();
            if self.stack.is_empty() {
                self.inheritance = Inheritance {
                    parent: parent.clone(),
                    extends,
                };
            }
            inherit(&mut parent, child);
            Ok(parent)
        }
    }
    let mut loader = Loader {
        watched,
        dependencies: Vec::new(),
        watch: Vec::new(),
        stack: Vec::new(),
        bytes: 0,
        inheritance: Inheritance::default(),
    };
    let value = loader.file(path, source)?;
    Ok(RawConfig {
        value,
        inheritance: loader.inheritance,
        dependencies: loader.dependencies,
        watch: loader.watch,
    })
}

/// Convert already exported data to JSON5. This does not evaluate JavaScript callbacks.
pub fn json_to_json5(source: &str) -> Result<String, String> {
    let value = serde_json::from_str::<ConfigValue>(source)
        .map_err(|e| e.to_string())?
        .0;
    resolve_config(value.clone()).map_err(|e| e.message)?;
    json5::to_string(&value)
        .map(|output| format!("{output}\n"))
        .map_err(|e| e.to_string())
}

// serde_json::Value silently converts non-finite floats to null and overwrites
// duplicate keys. Reject both at the config boundary, preserving insertion order.
pub(crate) struct ConfigValue(pub(crate) Value);
impl<'de> Deserialize<'de> for ConfigValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        ConfigSeed(0).deserialize(deserializer).map(Self)
    }
}

struct ConfigSeed(usize);
impl<'de> DeserializeSeed<'de> for ConfigSeed {
    type Value = Value;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Value, D::Error> {
        if self.0 > 128 {
            return Err(de::Error::custom("Config nesting limit exceeded"));
        }
        deserializer.deserialize_any(self)
    }
}

impl<'de> Visitor<'de> for ConfigSeed {
    type Value = Value;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("configuration data")
    }
    fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Value, E> {
        Ok(Value::Bool(value))
    }
    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Value, E> {
        Ok(value.into())
    }
    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Value, E> {
        Ok(value.into())
    }
    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Value, E> {
        Number::from_f64(value).map(Value::Number).ok_or_else(|| {
            E::custom("Config numbers must be finite; NaN and Infinity are unsupported")
        })
    }
    fn visit_str<E: de::Error>(self, value: &str) -> Result<Value, E> {
        Ok(value.into())
    }
    fn visit_string<E: de::Error>(self, value: String) -> Result<Value, E> {
        Ok(Value::String(value))
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = seq.next_element_seed(ConfigSeed(self.0 + 1))? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
        let mut values = Map::new();
        while let Some(key) = map.next_key::<String>()? {
            if values.contains_key(&key) {
                return Err(de::Error::custom(format!("Duplicate config key `{key}`")));
            }
            values.insert(key, map.next_value_seed(ConfigSeed(self.0 + 1))?);
        }
        Ok(Value::Object(values))
    }
}

/// Preserve existing defaults and theme-section replacement, then apply theme.extend.
/// Reference resolution is data-only; it preserves arrays/objects for full references.
pub fn resolve_config(input: Value) -> Result<Value, Error> {
    let err = |message| Error::new("EU_CONFIG", message, 0);
    let input = input
        .as_object()
        .ok_or_else(|| err("Configuration must be an object"))?;
    if input.contains_key("extends") {
        return Err(err(
            "extends requires a config file path; use load_config instead of resolve_config",
        ));
    }
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
