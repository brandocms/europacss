//! Local cascade changes caused by legacy append/packing behavior.
use super::Audit;
use crate::{
    config::Config,
    parser::{self, Node},
    Error,
};
use lightningcss::{
    properties::Property,
    rules::CssRule,
    stylesheet::{ParserOptions, PrinterOptions, StyleSheet},
};
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub(super) struct Origins {
    append: HashMap<usize, HashSet<String>>,
    labels: HashMap<usize, String>,
}

pub(super) fn origins(nodes: &[Node], config: &Config<'_>) -> Result<Origins, Error> {
    fn collect(
        nodes: &[Node],
        config: &Config<'_>,
        iterated: bool,
        result: &mut Origins,
    ) -> Result<(), Error> {
        for node in nodes {
            if iterated {
                result
                    .append
                    .entry(node.offset)
                    .or_default()
                    .insert("*".into());
            }
            let mut iteration = iterated;
            if let Some((name, params)) = node.at_rule() {
                result.labels.insert(node.offset, format!("@{name}"));
                if name == "unpack" {
                    result
                        .append
                        .entry(node.offset)
                        .or_default()
                        .insert("*".into());
                }
                iteration |= name == "iterate";
                if matches!(name, "font" | "fontsize") {
                    let args = parser::arguments(params)?;
                    let token = args.get(usize::from(name == "font"));
                    if let Some(base) = token
                        .and_then(|token| config.get("/theme/typography/sizes", token))
                        .and_then(|v| v.get("__base__"))
                        .and_then(|v| v.as_object())
                    {
                        result
                            .append
                            .entry(node.offset)
                            .or_default()
                            .extend(base.keys().cloned());
                    }
                }
            }
            if let Some(children) = &node.children {
                collect(children, config, iteration, result)?;
            }
        }
        Ok(())
    }
    let mut result = Origins::default();
    collect(nodes, config, false, &mut result)?;
    Ok(result)
}

#[derive(Clone)]
struct Value {
    property: String,
    text: String,
    important: bool,
}
struct Declaration {
    offset: usize,
    conditions: Vec<String>,
    values: Vec<Value>,
    raw_property: String,
}

fn values(text: &str) -> Option<Vec<Value>> {
    let css = format!(".migration-probe{{{text};}}");
    let sheet = StyleSheet::parse(&css, ParserOptions::default()).ok()?;
    let [CssRule::Style(style)] = sheet.rules.0.as_slice() else {
        return None;
    };
    fn add(property: &Property<'_>, important: bool, result: &mut Vec<Value>) -> Option<()> {
        let id = property.property_id();
        if let Some(longhands) = id.longhands() {
            for id in longhands {
                if let Some(value) = property.longhand(&id) {
                    add(&value, important, result)?;
                } else {
                    result.push(Value {
                        property: id.name().into(),
                        text: property
                            .to_css_string(false, PrinterOptions::default())
                            .ok()?,
                        important,
                    });
                }
            }
        } else {
            result.push(Value {
                property: id.name().into(),
                text: property
                    .to_css_string(false, PrinterOptions::default())
                    .ok()?,
                important,
            });
        }
        Some(())
    }
    let mut result = Vec::new();
    for property in &style.declarations.declarations {
        add(property, false, &mut result)?;
    }
    for property in &style.declarations.important_declarations {
        add(property, true, &mut result)?;
    }
    Some(result)
}

fn appended(origin: &Origins, declaration: &Declaration) -> bool {
    origin
        .append
        .get(&declaration.offset)
        .is_some_and(|props| props.contains("*") || props.contains(&declaration.raw_property))
}

fn overlaps(a: &str, b: &str) -> bool {
    let resettable = |p: &str| !p.starts_with("--") && !matches!(p, "direction" | "unicode-bidi");
    a == b || a == "all" && resettable(b) || b == "all" && resettable(a)
}

pub(super) fn walk(nodes: &[Node], origins: &Origins, audit: &mut Audit<'_>) -> Result<(), Error> {
    fn collect(nodes: &[Node], conditions: &mut Vec<String>, result: &mut Vec<Declaration>) {
        for node in nodes {
            if let Some(children) = &node.children {
                if node
                    .at_rule()
                    .is_some_and(|(name, _)| matches!(name, "media" | "supports" | "container"))
                {
                    conditions.push(node.text.clone());
                    collect(children, conditions, result);
                    conditions.pop();
                }
            } else if !node.text.starts_with("/*") && node.at_rule().is_none() {
                if let Some((property, _)) = node.text.split_once(':') {
                    if let Some(values) = values(&node.text) {
                        result.push(Declaration {
                            offset: node.offset,
                            conditions: conditions.clone(),
                            values,
                            raw_property: property.trim().into(),
                        });
                    }
                }
            }
        }
    }
    fn inspect(
        nodes: &[Node],
        origins: &Origins,
        audit: &mut Audit<'_>,
        work: &mut usize,
    ) -> Result<(), Error> {
        for node in nodes {
            let Some(children) = &node.children else {
                continue;
            };
            if node.at_rule().is_none() {
                let mut declarations = Vec::new();
                collect(children, &mut Vec::new(), &mut declarations);
                for (at, current) in declarations.iter().enumerate() {
                    if appended(origins, current) {
                        continue;
                    }
                    for previous in &declarations[..at] {
                        *work += 1;
                        if *work > 1_000_000 {
                            audit.incomplete(
                                node,
                                "Declaration-order analysis exceeded its comparison budget",
                            );
                            return Ok(());
                        }
                        if previous.offset == current.offset {
                            continue;
                        }
                        let append = appended(origins, previous)
                            && previous.conditions == current.conditions;
                        let packed = previous.conditions.len() > current.conditions.len()
                            && previous.conditions.starts_with(&current.conditions)
                            && previous.conditions[current.conditions.len()..]
                                .iter()
                                .any(|c| c.starts_with("@media "));
                        if !append && !packed {
                            continue;
                        }
                        for old in &previous.values {
                            for new in &current.values {
                                if !overlaps(&old.property, &new.property)
                                    || old.text == new.text
                                    || old.important != new.important
                                {
                                    continue;
                                }
                                let origin =
                                    audit.sources.locate(Error::new("", "", previous.offset));
                                let condition = if previous.conditions.is_empty() {
                                    "the same rule".into()
                                } else {
                                    previous.conditions.join(" / ")
                                };
                                let label = origins
                                    .labels
                                    .get(&previous.offset)
                                    .map(String::as_str)
                                    .unwrap_or("earlier CSS");
                                let behavior = if append {
                                    "legacy append order favored"
                                } else {
                                    "legacy media packing can favor"
                                };
                                audit.add("EU_MIGRATION_ORDER", format!("Within {condition}, {behavior} `{}` from {label} at {}:{}; source-order expansion places `{}` later", old.text, origin.filename.as_deref().unwrap_or("source"), origin.line, new.text), current.offset,
                                "Accept the later authored value if that is the intended result. To preserve the old appearance, move this fallback before the earlier directive/conditional, then review other affected properties and breakpoints. This appearance change is never applied by --fix.", None);
                            }
                        }
                    }
                }
            }
            inspect(children, origins, audit, work)?;
        }
        Ok(())
    }
    inspect(nodes, origins, audit, &mut 0)
}
