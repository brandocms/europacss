//! Local cascade changes caused by legacy append/packing behavior.
use super::{Audit, OrderConflict};
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
use std::collections::{BTreeMap, HashMap, HashSet};

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

type CascadeKey = (usize, String, Vec<String>, Vec<String>);
struct CascadeDeclaration {
    declaration: Declaration,
    selector: String,
    specificity: u32,
    subject: super::subject::Subject,
    scopes: Vec<String>,
    boundaries: Vec<usize>,
    generated: bool,
    rank: usize,
}
impl CascadeDeclaration {
    fn key(&self) -> CascadeKey {
        (
            self.declaration.offset,
            self.selector.clone(),
            self.scopes.clone(),
            self.declaration.conditions.clone(),
        )
    }
}

/// Compare actual expansion before/after the ordering pass. Named layer blocks
/// share a cascade domain even though each block is an ordering boundary.
pub(super) fn scope_changes(
    raw: &[Node],
    ordered: &[Node],
    config: &Config<'_>,
    audit: &mut Audit<'_>,
    budget: usize,
) -> Result<(), Error> {
    #[derive(Clone, Default)]
    struct Context {
        selectors: Vec<String>,
        scopes: Vec<String>,
        boundaries: Vec<usize>,
        media: Vec<String>,
        generated: bool,
    }
    fn collect(
        nodes: &[Node],
        ctx: &Context,
        expanded: bool,
        result: &mut Vec<CascadeDeclaration>,
    ) -> Result<(), Error> {
        for node in nodes {
            if result.len() > 50_000 {
                return Err(Error::new(
                    "EU_LIMIT",
                    "Cross-selector analysis exceeded its 50000-declaration budget",
                    node.offset,
                ));
            }
            if let Some(children) = &node.children {
                let mut child = ctx.clone();
                match node.at_rule() {
                    Some(("media", _)) => {
                        child.media.push(node.text.clone());
                        child.generated |= node.generated_media;
                    }
                    Some(("layer" | "supports" | "container" | "starting-style", params)) => {
                        child.scopes.push(if params.is_empty() {
                            format!("{}#{}", node.text, node.offset)
                        } else {
                            node.text.clone()
                        });
                        child.boundaries.push(node.offset);
                    }
                    Some(_) => continue,
                    None => {
                        child.selectors.clear();
                        for selector in parser::split_top_level(&node.text, ',')? {
                            let values = if ctx.selectors.is_empty() {
                                vec![selector.to_owned()]
                            } else {
                                let parents = if expanded {
                                    ctx.selectors.clone()
                                } else {
                                    vec![format!(":is({})", ctx.selectors.join(", "))]
                                };
                                let Some(values) = super::selectors::expand(selector, &parents)?
                                else {
                                    return Err(Error::new("EU_LIMIT", "Cross-selector analysis exceeded its selector expansion budget", node.offset));
                                };
                                values
                            };
                            child.selectors.extend(values);
                            if child.selectors.len() > 256 {
                                return Err(Error::new(
                                    "EU_LIMIT",
                                    "Cross-selector analysis exceeded 256 selector branches",
                                    node.offset,
                                ));
                            }
                        }
                    }
                }
                collect(children, &child, expanded, result)?;
            } else if !ctx.selectors.is_empty()
                && node.at_rule().is_none()
                && !node.text.starts_with("/*")
            {
                let Some((property, _)) = node.text.split_once(':') else {
                    continue;
                };
                let Some(parsed) = values(&node.text) else {
                    continue;
                };
                for selector in &ctx.selectors {
                    let Some((specificity, _)) = super::selectors::specificity(selector) else {
                        continue;
                    };
                    result.push(CascadeDeclaration {
                        declaration: Declaration {
                            offset: node.offset,
                            conditions: ctx.media.clone(),
                            values: parsed.clone(),
                            raw_property: property.trim().into(),
                        },
                        selector: selector.clone(),
                        specificity,
                        subject: super::subject::Subject::parse(selector),
                        scopes: ctx.scopes.clone(),
                        boundaries: ctx.boundaries.clone(),
                        generated: ctx.generated,
                        rank: result.len(),
                    });
                }
            }
        }
        Ok(())
    }
    let expanded = config.value.get("nesting").and_then(|v| v.as_str()) == Some("expanded");
    let mut before = Vec::new();
    let mut after = Vec::new();
    collect(raw, &Context::default(), expanded, &mut before)?;
    collect(ordered, &Context::default(), expanded, &mut after)?;
    let mut ranks: HashMap<CascadeKey, std::collections::VecDeque<usize>> = HashMap::new();
    for item in before {
        ranks.entry(item.key()).or_default().push_back(item.rank);
    }
    for item in &mut after {
        item.rank = ranks
            .get_mut(&item.key())
            .and_then(|ranks| ranks.pop_front())
            .unwrap_or(item.rank);
    }
    // Only generated rules can be displaced by a later layer block. For
    // authored media, only preceding output rules with a *later input rank*
    // can have crossed it. Index both categories before comparing properties.
    let mut generated: HashMap<(Vec<String>, u32), DeclarationIndex> = HashMap::new();
    let mut ranked: HashMap<(Vec<String>, u32), RankedIndex> = HashMap::new();
    let mut groups: HashMap<(Vec<String>, String, String, bool), usize> = HashMap::new();
    let mut work = 0usize;
    for (index, current) in after.iter().enumerate() {
        let domain = (current.scopes.clone(), current.specificity);
        let mut candidates = Vec::new();
        if !current.generated {
            if let Some(history) = generated.get(&domain) {
                candidates.extend(history.candidates(&current.declaration));
            }
            if !current.declaration.conditions.is_empty() {
                if let Some(history) = ranked.get(&domain) {
                    candidates.extend(history.candidates(&current.declaration, current.rank));
                }
            }
        }
        if current.generated {
            generated
                .entry(domain.clone())
                .or_default()
                .insert(index, &current.declaration);
        }
        ranked
            .entry(domain)
            .or_default()
            .insert(index, current.rank, &current.declaration);
        candidates.sort_unstable();
        candidates.dedup();
        for candidate in candidates {
            let previous = &after[candidate];
            let split_append = previous.generated
                && !current.generated
                && previous.boundaries != current.boundaries;
            let authored_move = previous.selector != current.selector
                && previous.rank > current.rank
                && !current.generated
                && !current.declaration.conditions.is_empty();
            if (!split_append && !authored_move)
                || previous.subject.disjoint(&current.subject)
                || conditions_disjoint(
                    &previous.declaration.conditions,
                    &current.declaration.conditions,
                )
            {
                continue;
            }
            work += 1;
            if work > budget {
                audit.incomplete(&Node::leaf("", current.declaration.offset), &format!("Cross-selector order analysis exceeded its {budget}-comparison budget; rerun with --budget N to raise it"));
                return Ok(());
            }
            let first = &previous.declaration;
            let second = &current.declaration;
            let mut properties = Vec::new();
            let mut old_values = Vec::new();
            let mut new_values = Vec::new();
            let mut important = false;
            for old in &first.values {
                for new in &second.values {
                    if overlaps(&old.property, &new.property)
                        && old.text != new.text
                        && old.important == new.important
                    {
                        properties.push(new.property.clone());
                        old_values.push(old.text.clone());
                        new_values.push(new.text.clone());
                        important |= new.important;
                    }
                }
            }
            if properties.is_empty() {
                continue;
            }
            properties.sort();
            properties.dedup();
            old_values.sort();
            old_values.dedup();
            new_values.sort();
            new_values.dedup();
            let reason = if split_append {
                "separate layer/condition blocks interrupt legacy global responsive append order"
            } else {
                "authored media moved after a different equal-specificity selector"
            };
            let evidence = OrderConflict {
                earlier_source: audit
                    .sources
                    .locate(Error::new("", "", first.offset))
                    .into(),
                earlier_label: previous.selector.clone(),
                earlier: old_values.join("; "),
                later: new_values.join("; "),
                earlier_conditions: first.conditions.clone(),
                later_conditions: second.conditions.clone(),
                reason: reason.into(),
                selector_path: vec![previous.selector.clone(), current.selector.clone()],
            };
            let key = (
                current.scopes.clone(),
                previous.selector.clone(),
                current.selector.clone(),
                split_append,
            );
            if let Some(&index) = groups.get(&key) {
                let group = audit.findings[index].order_group.as_mut().unwrap();
                group.occurrences += 1;
                group.properties.extend(properties);
                group.properties.sort();
                group.properties.dedup();
                if important {
                    group.review_priority.important = true;
                    group.review_priority.rank = 1;
                }
                if group.examples.len() < 5 {
                    group.examples.push(evidence);
                }
            } else {
                let index = audit.findings.len();
                audit.add_order(format!("Potential cascade change: {reason}. `{}` precedes `{}` in native output (selector-pair group)", previous.selector, current.selector), second.offset,
                    if split_append { "Import one aggregate stylesheet with layer(name), keeping its component imports unlayered. Review the selector-pair group using computed styles; do not merge distinct semantic layers or conditions." }
                    else { "These selectors may match the same element. Review this selector-pair group across its properties and breakpoints with computed-style evidence. JSON includes occurrence counts and up to five examples; no automatic appearance edit is made." }, None, evidence.clone());
                if audit.findings.len() > index {
                    audit.findings[index].order_group = Some(super::OrderGroup {
                        occurrences: 1,
                        properties,
                        examples: vec![evidence],
                        review_priority: previous
                            .subject
                            .review_priority(&current.subject, important),
                    });
                    groups.insert(key, index);
                }
            }
        }
    }
    Ok(())
}

fn conditions_disjoint(a: &[String], b: &[String]) -> bool {
    fn ranges(conditions: &[String]) -> Option<Vec<crate::optimize::WidthRange>> {
        let mut result = vec![crate::optimize::WidthRange::all()];
        for condition in conditions {
            let query = condition.strip_prefix("@media ")?;
            let parts = crate::optimize::condition_width_ranges(query)?;
            result = result
                .iter()
                .flat_map(|a| parts.iter().map(move |b| a.intersect(*b)))
                .filter(|range| range.nonempty())
                .collect();
            if result.len() > 128 {
                return None;
            }
        }
        Some(result)
    }
    match (ranges(a), ranges(b)) {
        (Some(a), Some(b)) => !a.iter().any(|a| b.iter().any(|b| a.overlaps(*b))),
        _ => false,
    }
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
    a == b
        || a == "all" && resettable(b)
        || b == "all" && resettable(a)
        || edge_family(a).zip(edge_family(b)).is_some_and(
            |((family_a, logical_a), (family_b, logical_b))| {
                family_a == family_b && logical_a != logical_b
            },
        )
}

// Writing mode/direction are inherited runtime state. Conservatively overlap a
// logical edge with every physical edge in its family, without equating two
// distinct physical (or two distinct logical) longhands.
const EDGE_FAMILIES: [(&[&str], &[&str]); 3] = [
    (
        &[
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
        ],
        &[
            "padding-block-start",
            "padding-block-end",
            "padding-inline-start",
            "padding-inline-end",
        ],
    ),
    (
        &["margin-top", "margin-right", "margin-bottom", "margin-left"],
        &[
            "margin-block-start",
            "margin-block-end",
            "margin-inline-start",
            "margin-inline-end",
        ],
    ),
    (
        &["top", "right", "bottom", "left"],
        &[
            "inset-block-start",
            "inset-block-end",
            "inset-inline-start",
            "inset-inline-end",
        ],
    ),
];

fn edge_family(property: &str) -> Option<(usize, bool)> {
    EDGE_FAMILIES
        .iter()
        .enumerate()
        .find_map(|(index, (physical, logical))| {
            if physical.contains(&property) {
                Some((index, false))
            } else if logical.contains(&property) {
                Some((index, true))
            } else {
                None
            }
        })
}

fn overlapping_properties(property: &str) -> Vec<&str> {
    let mut keys = vec![property];
    if let Some((family, logical)) = edge_family(property) {
        keys.extend(if logical {
            EDGE_FAMILIES[family].0
        } else {
            EDGE_FAMILIES[family].1
        });
    }
    keys
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
                for property in overlapping_properties(&value.property) {
                    if let Some(found) = self.properties.get(&(property.into(), value.important)) {
                        indices.extend(found);
                    }
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

/// Index candidate properties by original source rank so unchanged-order rules
/// are not visited. `all` and importance have the same semantics as DeclarationIndex.
#[derive(Default)]
struct RankedIndex {
    properties: HashMap<(String, bool), BTreeMap<usize, Vec<usize>>>,
    resettable: [BTreeMap<usize, Vec<usize>>; 2],
}
impl RankedIndex {
    fn insert(&mut self, index: usize, rank: usize, declaration: &Declaration) {
        for value in &declaration.values {
            self.properties
                .entry((value.property.clone(), value.important))
                .or_default()
                .entry(rank)
                .or_default()
                .push(index);
            if resettable(&value.property) {
                self.resettable[usize::from(value.important)]
                    .entry(rank)
                    .or_default()
                    .push(index);
            }
        }
    }
    fn candidates(&self, declaration: &Declaration, rank: usize) -> Vec<usize> {
        let mut result = Vec::new();
        let mut append = |map: &BTreeMap<usize, Vec<usize>>| {
            for (_, indices) in
                map.range((std::ops::Bound::Excluded(rank), std::ops::Bound::Unbounded))
            {
                result.extend(indices);
            }
        };
        for value in &declaration.values {
            if value.property == "all" {
                append(&self.resettable[usize::from(value.important)]);
            } else {
                for property in overlapping_properties(&value.property) {
                    if let Some(map) = self.properties.get(&(property.into(), value.important)) {
                        append(map);
                    }
                }
                if resettable(&value.property) {
                    if let Some(map) = self.properties.get(&("all".into(), value.important)) {
                        append(map);
                    }
                }
            }
        }
        result.sort_unstable();
        result.dedup();
        result
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
                                audit.add_order(format!("Within {condition}, {behavior} `{}` from {label} at {}:{}; native expansion places `{}` later", old.text, origin.filename.as_deref().unwrap_or("source"), origin.line, new.text), current.offset,
                                "Accept the later authored value if that is intended. To preserve the earlier override, move this fallback before the directive/conditional and review all affected widths. When a proposal is available, set apply_fix:true on this finding and use --apply with the reviewed report. --fix never makes this appearance choice.", fix, OrderConflict {
                                    earlier_source: origin.into(), earlier_label: label.into(),
                                    earlier: old.text.clone(), later: new.text.clone(),
                                    earlier_conditions: previous.conditions.clone(), later_conditions: current.conditions.clone(),
                                    reason: behavior.into(), selector_path: Vec::new(),
                                });
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
                            audit.add_order(format!("Repeated selector path `{}`: legacy media packing can favor `{}` under {} at {}:{}; native expansion places `{}` later in another rule", ctx.selectors.join(" → "), old.text, previous.conditions.join(" / "), origin.filename.as_deref().unwrap_or("source"), origin.line, new.text), current.offset,
                                "Review this repeated selector at the affected widths. Restrict overlapping ranges or order the responsive rules deliberately to preserve the intended override. --fix does not reorder declarations or rules automatically.", None, OrderConflict {
                                    earlier_source: origin.into(), earlier_label: "earlier CSS".into(),
                                    earlier: old.text.clone(), later: new.text.clone(),
                                    earlier_conditions: previous.conditions.clone(), later_conditions: current.conditions.clone(),
                                    reason: "legacy media packing can favor".into(), selector_path: ctx.selectors.clone(),
                                });
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
            "padding-block:6px",
            "padding-inline-end:7px!important",
            "margin-inline:8px",
            "margin-top:9px",
            "inset:10px",
            "inset-block:11px",
            "left:12px",
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
