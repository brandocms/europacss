//! Differences verified against git tag 1.0.0-beta.6 (2bfb3df).
//! Run at expanded directive uses, so inactive placeholders/iterations do not warn.
use crate::{config::Config, parser::Node};
use serde_json::Value;

fn path<'a>(mut value: &'a Value, key: &str, separator: char) -> Option<&'a Value> {
    for part in key.split(separator) {
        value = value.get(part)?;
    }
    Some(value)
}

pub(crate) fn directive(
    node: &Node,
    name: &str,
    args: &[&str],
    responsive: Option<&str>,
    config: &Config<'_>,
) {
    let warn = |message: String| config.beta6_warning(node.offset, || message);
    if name == "mq" {
        warn("@mq was not a Europa directive in beta.6; its contents now become active responsive CSS".into());
    }
    if matches!(name, "color" | "color!") {
        if args.len() > 2 {
            warn("beta.6 ignored the breakpoint argument of @color; native output applies that condition instead of applying the color at every enclosing width".into());
        }
        if args.get(1).is_some_and(|s| s.contains(char::is_whitespace)) {
            warn("beta.6 split @color arguments at spaces, truncating CSS functions containing spaces; native parsing retains the complete color expression".into());
        }
    }
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
                warn(format!("@{name} token `{key}` selects a different value from beta.6's {} lookup; review the old resolved value", if family { "literal/slash" } else { "dot-path" }));
            }
        }
    }
    if matches!(name, "space" | "space!") {
        if args
            .first()
            .is_some_and(|p| *p == "breakout" || p.starts_with("negate("))
        {
            warn("This @space breakout/negate shorthand was added after beta.6; it now produces declarations instead of the old invalid or missing output".into());
        }
        if args.first() == Some(&"container") {
            if let Some(query) = args.get(1).copied().or(responsive) {
                if query.contains(['<', '>', '$'])
                    && config.select(query, node.offset).is_ok_and(|v| v.len() > 1)
                {
                    warn("beta.6 grouped all container breakpoints in this query using the first breakpoint's padding/max-width; native output resolves each breakpoint's container values".into());
                }
            }
        }
    }
    let query = match name {
        "responsive" | "mq" => args.first(),
        "space" | "space!" if args.first() == Some(&"container") => args.get(1),
        "space" | "space!" | "color" | "color!" | "font" => args.get(2),
        "fontsize" | "display" | "order" | "column" | "column-offset" => args.get(1),
        "abs100" | "abs100!" => args.first(),
        _ => None,
    };
    if let Some(query) = query {
        let mut query = *query;
        for _ in 0..64 {
            if query.contains("->") {
                warn(
                    "Pixel arrow ranges were added after beta.6; review the newly active condition"
                        .into(),
                );
                break;
            }
            if !query.starts_with('$') {
                break;
            }
            let Some(next) = config
                .value
                .pointer("/theme/breakpointCollections")
                .and_then(|v| v.get(query))
                .and_then(Value::as_str)
            else {
                break;
            };
            query = next;
        }
    }
}
