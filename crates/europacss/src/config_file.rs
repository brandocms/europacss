use crate::{
    config::{lookup, scalar},
    Error,
};
use serde::{
    de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use serde_json::{Map, Number, Value};
use std::{collections::HashMap, fs, path::Path};

pub fn load_config(path: &Path) -> Result<Value, String> {
    let source = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let value = match path.extension().and_then(|s| s.to_str()) {
        Some("json5") => json5::from_str::<ConfigValue>(&source).map_err(|e| e.to_string()),
        Some("json") => serde_json::from_str::<ConfigValue>(&source).map_err(|e| e.to_string()),
        _ => Err(
            "Expected .json5 or .json config; JavaScript configuration must be migrated first"
                .into(),
        ),
    }
    .map_err(|e| format!("{}: {e}", path.display()))?;
    resolve_config(value.0).map_err(|e| format!("{}: {}", path.display(), e.message))
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
