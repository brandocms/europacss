//! Differences verified against tag 1.0.0-beta.11 (82f7867) and Site D's installed
//! package: all 63 source/stub files match. Only expanded uses are checked.
use crate::{config::Config, parser::Node};
use serde_json::Value;

fn path<'a>(mut value: &'a Value, key: &str, separator: char) -> Option<&'a Value> {
    for part in key.split(separator) {
        value = value.get(part)?;
    }
    Some(value)
}

pub(crate) fn directive(node: &Node, name: &str, args: &[&str], config: &Config<'_>) {
    let lookup = match name {
        "color" | "color!" => Some(("/theme/colors", args.get(1), false)),
        "font" => Some(("/theme/typography/families", args.first(), true)),
        "if" | "iterate" | "unpack" => Some(("", args.first(), false)),
        _ => None,
    };
    if let Some((base, Some(key), family)) = lookup {
        if let Some(value) = config.value.pointer(base) {
            let old = if family {
                value.get(*key).or_else(|| path(value, key, '/'))
            } else {
                path(value, key, '.')
            };
            if old != config.get(base, key) {
                config.beta11_warning(node.offset, || format!("@{name} token `{key}` selects a different value from beta.11's {} lookup; review the old resolved value", if family { "literal/slash" } else { "dot-path" }));
            }
        }
    }
    if matches!(name, "space" | "space!")
        && args
            .first()
            .is_some_and(|p| *p == "breakout" || p.starts_with("negate("))
    {
        config.beta11_warning(node.offset, || "This @space breakout/negate shorthand was added after beta.11; it now produces declarations instead of the old invalid or missing output".into());
    }
}
