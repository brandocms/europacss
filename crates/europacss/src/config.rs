use crate::Error;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::HashSet;

#[derive(Default)]
pub struct MigrationWarnings {
    pub items: Vec<Error>,
    seen: HashSet<(String, usize, String)>,
}

pub struct Config<'a> {
    pub value: &'a Value,
    pub breakpoints: Vec<(String, f64)>,
    pub migration_warnings: Option<RefCell<MigrationWarnings>>,
    pub migration_beta6: bool,
    pub migration_beta11: bool,
}

pub fn lookup<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    fn traverse<'a, 'b>(
        mut value: &'a Value,
        path: impl Iterator<Item = &'b str>,
    ) -> Option<&'a Value> {
        for key in path {
            value = value.get(key)?;
        }
        Some(value)
    }
    // Keep literal slash keys ahead of hierarchical slash traversal, as in Europa today.
    traverse(value, key.split('.')).or_else(|| traverse(value, key.split('/')))
}

pub fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

impl<'a> Config<'a> {
    pub fn new(value: &'a Value) -> Result<Self, Error> {
        let mut breakpoints = Vec::new();
        if let Some(bps) = value
            .pointer("/theme/breakpoints")
            .and_then(Value::as_object)
        {
            for (name, value) in bps {
                let px = scalar(value).and_then(|v| pixels(&v)).ok_or_else(|| {
                    Error::new(
                        "EU_CONFIG",
                        format!("Breakpoint `{name}` must be a non-negative px value"),
                        0,
                    )
                })?;
                breakpoints.push((name.clone(), px));
            }
        }
        breakpoints.sort_by(|a, b| a.1.total_cmp(&b.1));
        if breakpoints.windows(2).any(|pair| pair[0].1 == pair[1].1) {
            return Err(Error::new(
                "EU_CONFIG",
                "Breakpoints must have distinct widths",
                0,
            ));
        }
        Ok(Self {
            value,
            breakpoints,
            migration_warnings: None,
            migration_beta6: false,
            migration_beta11: false,
        })
    }
    /// Record resolved sizing behavior only while running explicit migration analysis.
    pub fn migration_warning(&self, offset: usize, message: impl FnOnce() -> String) {
        self.migration_notice("EU_MIGRATION_SIZE", offset, message);
    }
    pub fn beta6_warning(&self, offset: usize, message: impl FnOnce() -> String) {
        if self.migration_beta6 {
            self.migration_notice("EU_MIGRATION_LEGACY6", offset, message);
        }
    }
    pub fn beta11_warning(&self, offset: usize, message: impl FnOnce() -> String) {
        if self.migration_beta11 {
            self.migration_notice("EU_MIGRATION_LEGACY11", offset, message);
        }
    }
    pub fn migration_notice(&self, code: &str, offset: usize, message: impl FnOnce() -> String) {
        let Some(warnings) = &self.migration_warnings else {
            return;
        };
        let mut warnings = warnings.borrow_mut();
        let message = message();
        // Boundary corrections are reported once per boundary, at the first use.
        let key_offset = if code == "EU_MIGRATION_BREAKPOINT" {
            0
        } else {
            offset
        };
        if !warnings
            .seen
            .insert((code.into(), key_offset, message.clone()))
        {
            return;
        }
        warnings.items.push(Error::new(code, message, offset));
    }
    pub fn get(&self, base: &str, key: &str) -> Option<&'a Value> {
        lookup(self.value.pointer(base)?, key)
    }
    pub fn select(&self, query: &str, offset: usize) -> Result<Vec<usize>, Error> {
        let mut result = Vec::new();
        self.select_into(query, &mut result, 0, offset)?;
        result.sort_unstable();
        result.dedup();
        Ok(result)
    }
    fn select_into(
        &self,
        query: &str,
        result: &mut Vec<usize>,
        depth: usize,
        offset: usize,
    ) -> Result<(), Error> {
        if depth > 32 {
            return Err(Error::new(
                "EU_BREAKPOINT",
                "Cyclic or excessively nested breakpoint collection",
                offset,
            ));
        }
        for part in query.split('/') {
            if part.starts_with('$') {
                let collection = self
                    .value
                    .pointer("/theme/breakpointCollections")
                    .and_then(|v| v.get(part))
                    .and_then(Value::as_str)
                    .ok_or_else(|| {
                        Error::new(
                            "EU_BREAKPOINT",
                            format!("Unknown breakpoint collection `{part}`"),
                            offset,
                        )
                    })?;
                self.select_into(collection, result, depth + 1, offset)?;
                continue;
            }
            let (op, name) = [">=", "<=", ">", "<"]
                .iter()
                .find_map(|op| part.strip_prefix(op).map(|name| (*op, name)))
                .unwrap_or(("", part));
            let idx = self
                .breakpoints
                .iter()
                .position(|(key, _)| key == name)
                .ok_or_else(|| {
                    Error::new(
                        "EU_BREAKPOINT",
                        format!("Unknown breakpoint `{name}`"),
                        offset,
                    )
                })?;
            result.extend((0..self.breakpoints.len()).filter(|i| match op {
                ">=" => *i >= idx,
                ">" => *i > idx,
                "<=" => *i <= idx,
                "<" => *i < idx,
                _ => *i == idx,
            }));
        }
        Ok(())
    }
    pub fn media(&self, query: &str, offset: usize) -> Result<String, Error> {
        if let Some((min, max)) = query.split_once("->") {
            let min = if min.is_empty() {
                None
            } else {
                Some(pixels(min).ok_or_else(|| {
                    Error::new("EU_BREAKPOINT", "Range minimum must be a px value", offset)
                })?)
            };
            let max = if max.is_empty() {
                None
            } else {
                Some(pixels(max).ok_or_else(|| {
                    Error::new("EU_BREAKPOINT", "Range maximum must be a px value", offset)
                })?)
            };
            if min.is_none() && max.is_none() || min.zip(max).is_some_and(|(a, b)| a > b) {
                return Err(Error::new(
                    "EU_BREAKPOINT",
                    "Empty or reversed breakpoint range",
                    offset,
                ));
            }
            return Ok(range(min.unwrap_or(0.0), max, "<="));
        }
        let indices = self.select(query, offset)?;
        Ok(self.media_indices(&indices, offset))
    }
    pub fn media_indices(&self, indices: &[usize], offset: usize) -> String {
        if indices.is_empty() {
            return "not all".into();
        }
        let mut ranges = Vec::new();
        let mut start = indices[0];
        let mut end = start;
        for &idx in &indices[1..] {
            if idx == end + 1 {
                end = idx;
            } else {
                ranges.push(self.interval(start, end, offset));
                start = idx;
                end = idx;
            }
        }
        ranges.push(self.interval(start, end, offset));
        ranges.join(", ")
    }
    fn interval(&self, start: usize, end: usize, offset: usize) -> String {
        if let Some((name, next)) = self.breakpoints.get(end + 1) {
            self.migration_notice("EU_MIGRATION_BREAKPOINT", offset, || format!(
                "Named breakpoint ranges used here now end at width < {next}px (`{name}`), rather than width <= {}px. Reported once per boundary at its first use. Fractional widths in that final pixel now keep the preceding range active.", next - 1.0));
        }
        range(
            self.breakpoints[start].1,
            self.breakpoints.get(end + 1).map(|(_, n)| *n),
            "<",
        )
    }
}

fn pixels(s: &str) -> Option<f64> {
    let n = if s == "0" {
        Some(0.0)
    } else {
        s.strip_suffix("px")?.parse::<f64>().ok()
    }?;
    (n.is_finite() && n >= 0.0).then_some(n)
}

fn range(min: f64, max: Option<f64>, upper: &str) -> String {
    match (min > 0.0, max) {
        (false, None) => "all".into(),
        (true, None) => format!("(width >= {min}px)"),
        (false, Some(max)) => format!("(width {upper} {max}px)"),
        (true, Some(max)) => format!("(width >= {min}px) and (width {upper} {max}px)"),
    }
}

#[cfg(test)]
mod legacy_query_tests {
    use super::Config;
    use serde_json::{json, Value};

    #[test]
    fn all_31_legacy_query_selection_and_range_cases() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../tests/fixtures/legacy-utilities.json")).unwrap();
        let mut count = 0;
        for case in cases.iter().filter(|case| case.get("query").is_some()) {
            count += 1;
            let value = json!({"theme": case["theme"]});
            let config = Config::new(&value).unwrap();
            let query = case["query"].as_str().unwrap();
            if let Some(expected) = case.get("media") {
                assert_eq!(
                    config.media(query, 0).unwrap(),
                    expected.as_str().unwrap(),
                    "{}",
                    case["id"]
                );
            } else {
                let keys: Vec<_> = config
                    .select(query, 0)
                    .unwrap()
                    .into_iter()
                    .map(|i| config.breakpoints[i].0.as_str())
                    .collect();
                assert_eq!(json!(keys), case["keys"], "{}", case["id"]);
            }
        }
        assert_eq!(count, 31);
    }
}
