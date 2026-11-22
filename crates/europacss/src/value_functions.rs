use crate::{
    config::{lookup, scalar},
    parser::{rewrite_value, split_top_level},
    Error,
};
use serde_json::Value;

/// Evaluate Europa's value functions without touching strings or URL payloads.
pub fn resolve(source: &str, config: &Value, offset: usize) -> Result<String, Error> {
    let mut budget = Budget { calls: 0, bytes: 0 };
    evaluate(source, config, offset, 0, &mut budget)
}

struct Budget {
    calls: usize,
    bytes: usize,
}

fn evaluate(
    source: &str,
    config: &Value,
    offset: usize,
    depth: usize,
    budget: &mut Budget,
) -> Result<String, Error> {
    let error = |message| Error::new("EU_FUNCTION", message, offset);
    if depth > 64 {
        return Err(error(
            "Cyclic or excessively nested theme() expansion".into(),
        ));
    }
    rewrite_value(source, &mut |name, args| {
        let Some(args) = args.filter(|_| matches!(name, "theme" | "ease")) else {
            return Ok(None);
        };
        budget.calls += 1;
        if budget.calls > 100_000 {
            return Err(error("Value function expansion limit exceeded".into()));
        }
        let args = split_top_level(args, ',').map_err(|e| error(e.message))?;
        let key = unquote(args[0]);
        let value = if name == "ease" {
            if args.len() != 1 {
                return Err(error("ease() accepts one easing name".into()));
            }
            easing(if key.is_empty() { "ease" } else { key })
                .ok_or_else(|| error(format!("Unknown easing `{key}`")))?
                .to_string()
        } else {
            if key.is_empty() {
                return Err(error("theme() requires a token path".into()));
            }
            match config.get("theme").and_then(|theme| lookup(theme, key)) {
                Some(value) => {
                    let value = if let Some(values) = value.as_array() {
                        values
                            .iter()
                            .map(|v| {
                                scalar(v).ok_or_else(|| {
                                    error(format!(
                                        "theme({key}) must contain only strings or numbers"
                                    ))
                                })
                            })
                            .collect::<Result<Vec<_>, _>>()?
                            .join(", ")
                    } else {
                        scalar(value).ok_or_else(|| {
                            error(format!(
                                "theme({key}) must resolve to a CSS value, not an object or null"
                            ))
                        })?
                    };
                    evaluate(&value, config, offset, depth + 1, budget)?
                }
                None if args.len() > 1 => {
                    evaluate(&args[1..].join(", "), config, offset, depth + 1, budget)?
                }
                None => return Err(error(format!("Unknown theme token `{key}`"))),
            }
        };
        budget.bytes += value.len();
        if budget.bytes > 8 * 1024 * 1024 {
            return Err(error("Expanded CSS values exceed the size limit".into()));
        }
        Ok(Some(value))
    })
    .map_err(|e| {
        if e.code == "EU_PARSE" {
            error(e.message)
        } else {
            e
        }
    })
}

fn unquote(value: &str) -> &str {
    if value.len() >= 2 {
        let quote = value.as_bytes()[0];
        if matches!(quote, b'\'' | b'"') && value.as_bytes().last() == Some(&quote) {
            return &value[1..value.len() - 1];
        }
    }
    value
}

// Copied from evaluateEuropaFunctions.js; aliases intentionally share curves.
fn easing(name: &str) -> Option<&'static str> {
    Some(match name {
        "ease" => "cubic-bezier(0.25, 0.1, 0.25, 1.0)",
        "ease.in" => "cubic-bezier(0.42, 0.0, 1.0, 1.0)",
        "ease.out" => "cubic-bezier(0.0, 0.0, 0.58, 1.0)",
        "ease.inOut" => "cubic-bezier(0.42, 0.0, 0.58, 1.0)",
        "sine.in" => "cubic-bezier(0.47, 0, 0.745, 0.715)",
        "sine.out" => "cubic-bezier(0.39, 0.575, 0.565, 1)",
        "sine.inOut" => "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
        "quad.in" => "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
        "quad.out" => "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "quad.inOut" => "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
        "cubic.in" => "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
        "cubic.out" => "cubic-bezier(0.215, 0.61, 0.355, 1)",
        "cubic.inOut" => "cubic-bezier(0.645, 0.045, 0.355, 1)",
        "quart.in" => "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
        "quart.out" => "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "quart.inOut" => "cubic-bezier(0.77, 0, 0.175, 1)",
        "quint.in" => "cubic-bezier(0.755, 0.05, 0.855, 0.06)",
        "quint.out" => "cubic-bezier(0.23, 1, 0.32, 1)",
        "quint.inOut" => "cubic-bezier(0.86, 0, 0.07, 1)",
        "expo.in" => "cubic-bezier(0.95, 0.05, 0.795, 0.035)",
        "expo.out" => "cubic-bezier(0.19, 1, 0.22, 1)",
        "expo.inOut" => "cubic-bezier(1, 0, 0, 1)",
        "circ.in" => "cubic-bezier(0.6, 0.04, 0.98, 0.335)",
        "circ.out" => "cubic-bezier(0.075, 0.82, 0.165, 1)",
        "circ.inOut" => "cubic-bezier(0.785, 0.135, 0.15, 0.86)",
        "back.in" => "cubic-bezier(0.6, -0.28, 0.735, 0.045)",
        "back.out" => "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "back.inOut" => "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "power1.in" => "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
        "power1.out" => "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "power1.inOut" => "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
        "power2.in" => "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
        "power2.out" => "cubic-bezier(0.215, 0.61, 0.355, 1)",
        "power2.inOut" => "cubic-bezier(0.645, 0.045, 0.355, 1)",
        "power3.in" => "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
        "power3.out" => "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "power3.inOut" => "cubic-bezier(0.77, 0, 0.175, 1)",
        "power4.in" => "cubic-bezier(0.755, 0.05, 0.855, 0.06)",
        "power4.out" => "cubic-bezier(0.23, 1, 0.32, 1)",
        "power4.inOut" => "cubic-bezier(0.86, 0, 0.07, 1)",
        _ => return None,
    })
}
