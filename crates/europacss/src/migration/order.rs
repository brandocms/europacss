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
                if !config.migration_beta6 && matches!(name, "font" | "fontsize") {
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
    a == b || a == "all" && resettable(b) || b == "all" && resettable(a)
}

fn resettable(property: &str) -> bool {
    !property.starts_with("--") && !matches!(property, "direction" | "unicode-bidi")
}

/// Index expanded longhands, including `all`'s reset semantics. Source-order
/// indices keep diagnostics deterministic; unrelated properties cost no comparisons.
#[derive(Default)]
struct DeclarationIndex {
    properties: HashMap<(String, bool), Vec<usize>>,
    resettable: [Vec<usize>; 2],
}
impl DeclarationIndex {
    fn insert(&mut self, index: usize, declaration: &Declaration) {
        for value in &declaration.values {
            self.properties
                .entry((value.property.clone(), value.important))
                .or_default()
                .push(index);
            if resettable(&value.property) {
                self.resettable[usize::from(value.important)].push(index);
            }
        }
    }

    fn candidates(&self, current: &Declaration) -> Vec<usize> {
        let mut indices = Vec::new();
        for value in &current.values {
            if value.property == "all" {
                indices.extend(&self.resettable[usize::from(value.important)]);
            } else {
                if let Some(found) = self
                    .properties
                    .get(&(value.property.clone(), value.important))
                {
                    indices.extend(found);
                }
                if resettable(&value.property) {
                    if let Some(found) = self.properties.get(&("all".into(), value.important)) {
                        indices.extend(found);
                    }
                }
            }
        }
        indices.sort_unstable();
        indices.dedup();
        indices
    }
}

// The legacy pipeline groups/sorts media globally and can collapse uniform
// responsive token values before packing. Different overlapping width groups
// therefore need review even when native expansion nests equivalent intervals.
fn packing_risk(previous: &[String], current: &[String]) -> bool {
    if previous.len() > current.len()
        && previous.starts_with(current)
        && previous[current.len()..]
            .iter()
            .any(|c| c.starts_with("@media "))
    {
        return true;
    }
    if previous == current {
        return false;
    }
    fn interval(conditions: &[String]) -> Option<crate::optimize::WidthRange> {
        let mut range = crate::optimize::WidthRange::all();
        if conditions.is_empty() {
            return None;
        }
        for condition in conditions {
            let ranges = crate::optimize::width_query_ranges(condition.strip_prefix("@media ")?)?;
            let [part] = ranges.as_slice() else {
                return None;
            };
            range = range.intersect(*part);
        }
        range.nonempty().then_some(range)
    }
    match (interval(previous), interval(current)) {
        (Some(a), Some(b)) => a.overlaps(b),
        _ => false,
    }
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
                // Legacy sizing plugins coalesced equal breakpoint values before
                // global media sorting. Compare each property's full value group,
                // not just one generated breakpoint declaration.
                let mut groups: HashMap<(usize, String, String, bool), HashSet<Vec<String>>> =
                    HashMap::new();
                for declaration in &declarations {
                    for value in &declaration.values {
                        groups
                            .entry((
                                declaration.offset,
                                value.property.clone(),
                                value.text.clone(),
                                value.important,
                            ))
                            .or_default()
                            .insert(declaration.conditions.clone());
                    }
                }
                let mut index = DeclarationIndex::default();
                for (at, current) in declarations.iter().enumerate() {
                    let candidates = index.candidates(current);
                    index.insert(at, current);
                    if appended(origins, current) {
                        continue;
                    }
                    for candidate in candidates {
                        let previous = &declarations[candidate];
                        if previous.offset == current.offset {
                            continue;
                        }
                        *work += 1;
                        if *work > 1_000_000 {
                            audit.incomplete(
                                node,
                                "Declaration-order analysis exceeded its comparison budget",
                            );
                            return Ok(());
                        }
                        let append = appended(origins, previous)
                            && previous.conditions == current.conditions;
                        let packed = packing_risk(&previous.conditions, &current.conditions);
                        for old in &previous.values {
                            for new in &current.values {
                                let regrouped = previous.conditions == current.conditions
                                    && previous.conditions.iter().any(|c| c.starts_with("@media "))
                                    && origins.labels.contains_key(&previous.offset)
                                    && origins.labels.contains_key(&current.offset)
                                    && groups.get(&(
                                        previous.offset,
                                        old.property.clone(),
                                        old.text.clone(),
                                        old.important,
                                    )) != groups.get(&(
                                        current.offset,
                                        new.property.clone(),
                                        new.text.clone(),
                                        new.important,
                                    ));
                                if !append && !packed && !regrouped {
                                    continue;
                                }
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
                                let fix = audit
                                    .order_fixes
                                    .get(&(previous.offset, current.offset))
                                    .filter(|fix| {
                                        let bytes: usize = fix
                                            .edits
                                            .iter()
                                            .map(|e| e.expected.len() + e.replacement.len())
                                            .sum();
                                        if audit.fix_bytes.saturating_add(bytes) > 8 * 1024 * 1024 {
                                            return false;
                                        }
                                        audit.fix_bytes += bytes;
                                        true
                                    })
                                    .cloned();
                                audit.add("EU_MIGRATION_ORDER", format!("Within {condition}, {behavior} `{}` from {label} at {}:{}; source-order expansion places `{}` later", old.text, origin.filename.as_deref().unwrap_or("source"), origin.line, new.text), current.offset,
                                "Accept the later authored value if that is intended. To preserve the earlier override, move this fallback before the directive/conditional and review all affected widths. When a proposal is available, set apply_fix:true on this finding and use --apply-fixes with the reviewed report. --fix never makes this appearance choice.", fix);
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

/// Exact repeated selector paths can cross a conditional block boundary even
/// when their declarations live in different authored rule nodes. This does not
/// attempt general selector equivalence or cross-selector cascade analysis.
pub(super) fn repeated_selectors(nodes: &[Node], audit: &mut Audit<'_>) {
    type SelectorScope = (Vec<String>, Vec<(String, usize)>);
    #[derive(Default)]
    struct History {
        declarations: Vec<(usize, Declaration)>,
        index: DeclarationIndex,
    }
    #[derive(Default)]
    struct Context {
        selectors: Vec<String>,
        scopes: Vec<(String, usize)>,
        media: Vec<String>,
        seen: HashMap<SelectorScope, History>,
        work: usize,
    }
    fn visit(nodes: &[Node], owner: usize, ctx: &mut Context, audit: &mut Audit<'_>) -> bool {
        for node in nodes {
            if let Some(children) = &node.children {
                match node.at_rule() {
                    Some(("media", _)) => {
                        ctx.media.push(node.text.clone());
                        let complete = visit(children, owner, ctx, audit);
                        ctx.media.pop();
                        if !complete {
                            return false;
                        }
                    }
                    Some(("supports" | "container" | "layer" | "scope", _)) => {
                        // Keep each non-media scope separate: legacy scope loss
                        // is not modeled by this exact-path check.
                        ctx.scopes.push((node.text.clone(), node.offset));
                        let complete = visit(children, owner, ctx, audit);
                        ctx.scopes.pop();
                        if !complete {
                            return false;
                        }
                    }
                    Some(_) => {}
                    None => {
                        let nested_self = node.text.trim() == "&" && !ctx.selectors.is_empty();
                        if !nested_self {
                            ctx.selectors.push(node.text.trim().to_string());
                        }
                        let complete = visit(children, node.offset, ctx, audit);
                        if !nested_self {
                            ctx.selectors.pop();
                        }
                        if !complete {
                            return false;
                        }
                    }
                }
            } else if !ctx.selectors.is_empty() && node.at_rule().is_none() {
                let Some((property, _)) = node.text.split_once(':') else {
                    continue;
                };
                let Some(parsed) = values(&node.text) else {
                    continue;
                };
                let current = Declaration {
                    offset: node.offset,
                    conditions: ctx.media.clone(),
                    values: parsed,
                    raw_property: property.trim().into(),
                };
                let history = ctx
                    .seen
                    .entry((ctx.selectors.clone(), ctx.scopes.clone()))
                    .or_default();
                for candidate in history.index.candidates(&current) {
                    let (previous_owner, previous) = &history.declarations[candidate];
                    // The existing local check covers declarations from one rule.
                    if *previous_owner == owner || previous.offset == current.offset {
                        continue;
                    }
                    ctx.work += 1;
                    if ctx.work > 1_000_000 {
                        audit.incomplete(
                            node,
                            "Repeated-selector order analysis exceeded its comparison budget",
                        );
                        return false;
                    }
                    if !packing_risk(&previous.conditions, &current.conditions) {
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
                            let origin = audit.sources.locate(Error::new("", "", previous.offset));
                            audit.add("EU_MIGRATION_ORDER", format!("Repeated selector path `{}`: legacy media packing can favor `{}` under {} at {}:{}; source-order expansion places `{}` later in another rule", ctx.selectors.join(" → "), old.text, previous.conditions.join(" / "), origin.filename.as_deref().unwrap_or("source"), origin.line, new.text), current.offset,
                                "Review this repeated selector at the affected widths. To retain the old responsive override, put its media/Europa responsive block after the base rule. --fix does not reorder declarations or rules automatically.", None);
                        }
                    }
                }
                history.index.insert(history.declarations.len(), &current);
                history.declarations.push((owner, current));
            }
        }
        true
    }
    visit(nodes, 0, &mut Context::default(), audit);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn property_index_preserves_shorthand_all_custom_property_and_importance_conflicts() {
        let inputs = [
            "margin:1px 2px",
            "color:red",
            "--custom:old",
            "direction:rtl",
            "unicode-bidi:bidi-override",
            "all:initial",
            "padding:3px",
            "margin-left:4px",
            "color:blue!important",
            "all:unset!important",
            "--custom:new",
            "direction:ltr",
            "unicode-bidi:normal",
            "all:revert",
            "padding-top:5px!important",
            "all:initial!important",
        ];
        let declarations: Vec<_> = inputs
            .iter()
            .enumerate()
            .map(|(offset, text)| Declaration {
                offset,
                conditions: Vec::new(),
                values: values(text).unwrap(),
                raw_property: text.split_once(':').unwrap().0.into(),
            })
            .collect();
        let mut index = DeclarationIndex::default();
        for (at, current) in declarations.iter().enumerate() {
            let expected: Vec<_> = declarations[..at]
                .iter()
                .enumerate()
                .filter_map(|(i, previous)| {
                    previous
                        .values
                        .iter()
                        .any(|old| {
                            current.values.iter().any(|new| {
                                old.important == new.important
                                    && overlaps(&old.property, &new.property)
                            })
                        })
                        .then_some(i)
                })
                .collect();
            assert_eq!(index.candidates(current), expected, "{}", inputs[at]);
            index.insert(at, current);
        }
    }
}
