//! Translate a deliberately small, static JavaScript export syntax into JSON5.
//! No JavaScript is evaluated, and unsupported expressions fail before output.
use crate::config_file::{json_to_json5, resolve_config, ConfigValue};

pub fn migrate_config(source: &str, extension: &str) -> Result<String, String> {
    if source.len() > 16 * 1024 * 1024 {
        return Err("Config migration input exceeds 16 MiB".into());
    }
    match extension {
        "json" => return json_to_json5(source),
        "json5" => {
            validate(source)?;
            return Ok(source.into());
        }
        "js" | "cjs" | "mjs" => {}
        _ => return Err("Expected .json, .json5, or a static .js/.cjs/.mjs export".into()),
    }
    let tokens = tokens(source)?;
    let text = |index: usize| tokens.get(index).map(|&(start, end)| &source[start..end]);
    let mut edits = Vec::new();
    let mut start = 0;
    if matches!(text(0), Some("'use strict'" | "\"use strict\"")) && text(1) == Some(";") {
        edits.extend(tokens[..2].iter().map(|&(a, b)| (a, b, " ".repeat(b - a))));
        start = 2;
    }
    let prefix = if (0..4).map(|n| text(start + n)).eq([
        Some("module"),
        Some("."),
        Some("exports"),
        Some("="),
    ]) {
        4
    } else if text(start) == Some("export") && text(start + 1) == Some("default") {
        2
    } else {
        return Err("Expected one static `module.exports = { ... }` or `export default { ... }` export. Convert callbacks/imports to JSON5 data or token references; no JavaScript was executed.".into());
    };
    if text(start + prefix) != Some("{") {
        return Err(
            "The config export must be a static object, without calls, callbacks, or variables"
                .into(),
        );
    }
    edits.extend(
        tokens[start..start + prefix]
            .iter()
            .map(|&(a, b)| (a, b, " ".repeat(b - a))),
    );
    if text(tokens.len().saturating_sub(1)) == Some(";") {
        let &(a, b) = tokens.last().unwrap();
        edits.push((a, b, " ".into()));
    }
    edits.extend(static_theme_callbacks(source, &tokens, start + prefix)?);
    for (index, &(a, b)) in tokens.iter().enumerate().skip(start + prefix) {
        let value = &source[a..b];
        if text(index + 1) == Some(":") && value.bytes().all(|c| c.is_ascii_digit()) {
            if value.len() > 1 && value.starts_with('0')
                || !value
                    .parse::<u64>()
                    .is_ok_and(|n| n <= 9_007_199_254_740_991)
            {
                return Err(format!("Numeric key `{value}` needs manual review of its JavaScript string value; use an explicit quoted key"));
            }
            edits.push((a, b, format!("'{value}'")));
        }
    }
    edits.sort_by_key(|edit| edit.0);
    let mut output = String::new();
    let mut position = 0;
    for (start, end, replacement) in edits {
        output.push_str(&source[position..start]);
        output.push_str(&replacement);
        position = end;
    }
    output.push_str(&source[position..]);
    let value = json5::from_str::<ConfigValue>(&output).map_err(|e| format!("Static config conversion failed: {e}. Replace callbacks, spreads, computed keys, and other expressions with JSON5 data or token references; no JavaScript was executed."))?.0;
    literal_semantics(&value)?;
    resolve_config(value).map_err(|e| e.message)?;
    Ok(output)
}

// Legacy Europa evaluates theme section resolvers (including extensions). A
// zero-argument arrow returning an object literal needs no evaluation. Restrict
// this rewrite to those positions: functions elsewhere are not necessarily data.
// JSON5 validation below still rejects expressions anywhere in the returned body.
fn static_theme_callbacks(
    source: &str,
    tokens: &[(usize, usize)],
    start: usize,
) -> Result<Vec<(usize, usize, String)>, String> {
    let text = |i: usize| tokens.get(i).map(|&(a, b)| &source[a..b]);
    let mut stack = Vec::new();
    let mut edits = Vec::new();
    let mut i = start;
    while i < tokens.len() {
        match text(i) {
            Some("{" | "[") => {
                let key = if i >= 2 && text(i - 1) == Some(":") {
                    let key = text(i - 2).unwrap();
                    if key.starts_with(['\'', '"']) {
                        json5::from_str::<String>(key).unwrap_or_default()
                    } else {
                        key.into()
                    }
                } else {
                    String::new()
                };
                stack.push(key);
            }
            Some("}" | "]") => {
                stack.pop();
            }
            Some("(")
                if (stack == ["", "theme"] || stack == ["", "theme", "extend"])
                    && i >= 2
                    && text(i - 1) == Some(":")
                    && (0..6).map(|n| text(i + n)).eq([
                        Some("("),
                        Some(")"),
                        Some("="),
                        Some(">"),
                        Some("("),
                        Some("{"),
                    ]) =>
            {
                // Do not turn invalid JavaScript arrows into valid JSON5.
                if tokens[i + 2].1 != tokens[i + 3].0
                    || source[tokens[i + 1].1..tokens[i + 2].0]
                        .contains(['\n', '\r', '\u{2028}', '\u{2029}'])
                {
                    return Err("Invalid static theme arrow syntax".into());
                }
                let mut depth = 1usize;
                let mut end = i + 6;
                while end < tokens.len() && depth > 0 {
                    match text(end) {
                        Some("{") => depth += 1,
                        Some("}") => depth -= 1,
                        _ => {}
                    }
                    end += 1;
                }
                if depth != 0 || text(end) != Some(")") {
                    return Err("Expected a static theme arrow returning one object literal".into());
                }
                for index in (i..i + 5).chain(std::iter::once(end)) {
                    let (a, b) = tokens[index];
                    edits.push((a, b, " ".repeat(b - a)));
                }
                // No recursive callback conversion inside the returned object.
                i = end;
            }
            _ => {}
        }
        i += 1;
    }
    Ok(edits)
}

// JavaScript sorts array-index property names ahead of other keys; preserve the
// source text only if JSON5 iteration would keep that order. Do not silently move
// tokens/comments or turn a prototype-setting object literal into an own property.
fn literal_semantics(value: &serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::Object(object) => {
            let mut previous = None;
            let mut strings = false;
            for (key, value) in object {
                if key == "__proto__" {
                    return Err("JavaScript __proto__ object-literal semantics require manual config migration".into());
                }
                if let Some(index) = key
                    .parse::<u32>()
                    .ok()
                    .filter(|n| *n != u32::MAX && n.to_string() == *key)
                {
                    if strings || previous.is_some_and(|n| n > index) {
                        return Err("JavaScript would reorder numeric object keys; arrange integer keys in ascending order before other keys, then rerun conversion to retain iteration behavior".into());
                    }
                    previous = Some(index);
                } else {
                    strings = true;
                }
                literal_semantics(value)?;
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                literal_semantics(value)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate(source: &str) -> Result<(), String> {
    let value = json5::from_str::<ConfigValue>(source)
        .map_err(|e| e.to_string())?
        .0;
    resolve_config(value).map_err(|e| e.message)?;
    Ok(())
}

/// Only comments and quoted strings are opaque here; JSON5 validates all grammar.
fn tokens(source: &str) -> Result<Vec<(usize, usize)>, String> {
    let mut tokens = Vec::new();
    let mut position = 0;
    while position < source.len() {
        let rest = &source[position..];
        let c = rest.chars().next().unwrap();
        if c.is_whitespace() || c == '\u{feff}' {
            position += c.len_utf8();
            continue;
        }
        if rest.starts_with("//") {
            position += rest
                .find(['\n', '\r', '\u{2028}', '\u{2029}'])
                .unwrap_or(rest.len());
            continue;
        }
        if rest.starts_with("/*") {
            position += rest.find("*/").ok_or("Unclosed config comment")? + 2;
            continue;
        }
        let start = position;
        if matches!(c, '\'' | '"') {
            position += 1;
            let mut closed = false;
            while position < source.len() {
                let ch = source[position..].chars().next().unwrap();
                position += ch.len_utf8();
                if ch == '\\' {
                    if let Some(escaped) = source[position..].chars().next() {
                        position += escaped.len_utf8();
                    }
                } else if ch == c {
                    closed = true;
                    break;
                }
            }
            if !closed {
                return Err("Unclosed config string".into());
            }
        } else if c.is_alphanumeric() || matches!(c, '_' | '$') {
            position += rest
                .find(|ch: char| !(ch.is_alphanumeric() || matches!(ch, '_' | '$')))
                .unwrap_or(rest.len());
        } else {
            position += c.len_utf8();
        }
        tokens.push((start, position));
        if tokens.len() > 1_000_000 {
            return Err("Config migration token limit exceeded".into());
        }
    }
    Ok(tokens)
}
