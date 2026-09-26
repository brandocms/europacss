use crate::Error;
use serde_json::Value;
use std::cell::RefCell;

pub struct Config<'a> {
    pub value: &'a Value,
    pub breakpoints: Vec<(String, f64)>,
    pub migration_warnings: Option<RefCell<Vec<Error>>>,
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
        })
    }
    /// Record resolved sizing behavior only while running explicit migration analysis.
    pub fn migration_warning(&self, offset: usize, message: impl FnOnce() -> String) {
        let Some(warnings) = &self.migration_warnings else {
            return;
        };
        let mut warnings = warnings.borrow_mut();
        if warnings.len() > 512 {
            return;
        }
        let message = message();
        if warnings
            .iter()
            .any(|e| e.offset == offset && e.message == message)
        {
            return;
        }
        let error = if warnings.len() == 512 {
            Error::new(
                "EU_MIGRATION_INCOMPLETE",
                "Sizing migration exceeded its finding budget",
                offset,
            )
        } else {
            Error::new("EU_MIGRATION_SIZE", message, offset)
        };
        warnings.push(error);
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
            return Ok(range(min.unwrap_or(0.0), max));
        }
        let indices = self.select(query, offset)?;
        Ok(self.media_indices(&indices))
    }
    pub fn media_indices(&self, indices: &[usize]) -> String {
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
                ranges.push(self.interval(start, end));
                start = idx;
                end = idx;
            }
        }
        ranges.push(self.interval(start, end));
        ranges.join(", ")
    }
    fn interval(&self, start: usize, end: usize) -> String {
        range(
            self.breakpoints[start].1,
            self.breakpoints.get(end + 1).map(|(_, n)| n - 1.0),
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

fn range(min: f64, max: Option<f64>) -> String {
    match (min > 0.0, max) {
        (false, None) => "all".into(),
        (true, None) => format!("(width >= {min}px)"),
        (false, Some(max)) => format!("(width <= {max}px)"),
        (true, Some(max)) => format!("(width >= {min}px) and (width <= {max}px)"),
    }
}
