use super::Audit;
use crate::{
    parser::{self, Node},
    Error,
};
use lightningcss::{
    rules::CssRule,
    selector::{Component, Selector},
    stylesheet::{ParserOptions, StyleSheet},
};

const BRANCH_LIMIT: usize = 256;
const SELECTOR_LIMIT: usize = 16_384;

pub(super) struct Context {
    legacy: Vec<String>,
    native: Vec<String>,
    pseudo: bool,
}

pub(super) fn specificity(selector: &str) -> Option<(u32, bool)> {
    if selector.len() > SELECTOR_LIMIT {
        return None;
    }
    let css = format!("{selector} {{ --migration-probe: 0; }}");
    let sheet = StyleSheet::parse(&css, ParserOptions::default()).ok()?;
    let [CssRule::Style(style)] = sheet.rules.0.as_slice() else {
        return None;
    };
    if style.selectors.0.len() != 1 {
        return None;
    }
    let selector = &style.selectors.0[0];
    Some((
        selector_specificity(selector),
        selector.has_pseudo_element(),
    ))
}

// parcel_selectors 0.28 omits :has() from its cached specificity. Recompute
// recursively so :has() also contributes inside :is(), :not(), and nth-of lists.
fn selector_specificity(selector: &Selector<'_>) -> u32 {
    fn maximum(list: &[Selector<'_>]) -> u32 {
        list.iter().map(selector_specificity).max().unwrap_or(0)
    }
    let mut parts = [0u32; 3];
    for component in selector.iter_raw_match_order() {
        let value = match component {
            Component::ID(_) => 1 << 20,
            Component::Class(_)
            | Component::AttributeInNoNamespace { .. }
            | Component::AttributeInNoNamespaceExists { .. }
            | Component::AttributeOther(_)
            | Component::Root
            | Component::Empty
            | Component::Scope
            | Component::Nth(_)
            | Component::NonTSPseudoClass(_) => 1 << 10,
            Component::LocalName(_) | Component::PseudoElement(_) | Component::Part(_) => 1,
            Component::Is(list)
            | Component::Negation(list)
            | Component::Has(list)
            | Component::Any(_, list) => maximum(list),
            Component::NthOf(data) => {
                parts[1] += 1;
                maximum(data.selectors())
            }
            Component::Host(selector) => {
                parts[1] += 1;
                selector.as_ref().map(selector_specificity).unwrap_or(0)
            }
            Component::Slotted(selector) => {
                parts[2] += 1;
                selector_specificity(selector)
            }
            // :where(), combinators, namespaces, universal and unresolved &.
            _ => 0,
        };
        parts[0] += value >> 20;
        parts[1] += (value >> 10) & 1023;
        parts[2] += value & 1023;
    }
    (parts[0].min(1023) << 20) | (parts[1].min(1023) << 10) | parts[2].min(1023)
}

fn tuple(value: u32) -> String {
    format!(
        "({},{},{})",
        value >> 20,
        (value >> 10) & 1023,
        value & 1023
    )
}

pub(crate) fn expand(selector: &str, parents: &[String]) -> Result<Option<Vec<String>>, Error> {
    let offsets = parser::nesting_offsets(selector)?;
    if parents.len() > BRANCH_LIMIT {
        return Ok(None);
    }
    if offsets.is_empty() {
        let values: Vec<_> = parents.iter().map(|p| format!("{p} {selector}")).collect();
        return Ok(values
            .iter()
            .all(|s| s.len() <= SELECTOR_LIMIT)
            .then_some(values));
    }
    // postcss-nested 7 replaces every & in a child with the SAME selected parent
    // branch; it does not form the Cartesian product that native :is() permits.
    let mut values = Vec::new();
    for parent in parents {
        let mut value = String::new();
        let mut at = 0;
        for &offset in &offsets {
            if value.len() + offset - at + parent.len() > SELECTOR_LIMIT {
                return Ok(None);
            }
            value.push_str(&selector[at..offset]);
            value.push_str(parent);
            at = offset + 1;
        }
        value.push_str(&selector[at..]);
        values.push(value);
    }
    Ok(values
        .iter()
        .all(|s| s.len() <= SELECTOR_LIMIT)
        .then_some(values))
}

pub(super) fn walk(
    nodes: &[Node],
    parent: Option<&Context>,
    audit: &mut Audit<'_>,
) -> Result<(), Error> {
    for node in nodes {
        let Some(children) = &node.children else {
            continue;
        };
        if let Some((name, _)) = node.at_rule() {
            if matches!(
                name,
                "media" | "supports" | "layer" | "container" | "starting-style"
            ) {
                walk(children, parent, audit)?;
            } else if name == "scope" {
                audit.incomplete(
                    node,
                    "Nesting inside @scope requires manual migration review",
                );
            }
            continue;
        }
        if audit.selector_work >= 50_000 {
            audit.incomplete(node, "Selector analysis exceeded its 50000-branch budget");
            return Ok(());
        }
        let selectors = parser::split_top_level(&node.text, ',')?;
        let mut context = Context {
            legacy: Vec::new(),
            native: Vec::new(),
            pseudo: false,
        };
        let mut valid = true;
        if parent.is_some_and(|p| p.pseudo) {
            let mut candidates = Vec::new();
            for selector in &selectors {
                if let Some(expanded) = expand(selector, &parent.unwrap().legacy)? {
                    if candidates.len() + expanded.len() <= BRANCH_LIMIT
                        && expanded.iter().all(|s| specificity(s).is_some())
                    {
                        candidates.extend(expanded);
                    } else {
                        candidates.clear();
                        break;
                    }
                } else {
                    candidates.clear();
                    break;
                }
            }
            let help = if candidates.is_empty() {
                "Use explicit flattened selectors and review their matching behavior before migrating.".into()
            } else {
                format!("Move this rule outside its nested selector ancestors, preserving all enclosing media/layer/supports conditions and declaration order. The explicit legacy selector is: {}. Review the flattened rule before migrating.", candidates.join(", "))
            };
            audit.add("EU_MIGRATION_MATCHING", "A nested rule has a pseudo-element in its parent selector; native & does not represent pseudo-elements", node.offset,
                &help, None);
            // :is() cannot represent a pseudo-element parent. Do not report invented specificity values.
            audit.complete = false;
            continue;
        }
        for selector in selectors {
            if parent.is_some_and(|p| p.legacy.len() > 1)
                && parser::nesting_crosses_combinator(selector)?
            {
                audit.add("EU_MIGRATION_MATCHING", "Multiple & selectors separated by a combinator can match mixed parent alternatives in native CSS; postcss-nested reused one parent alternative throughout each branch", node.offset,
                    "Review matching behavior even if specificity is unchanged. Explicit legacy selectors preserve the same-parent combinations.", None);
            }
            let legacy = match parent {
                Some(parent) => expand(selector, &parent.legacy)?,
                None => Some(vec![selector.into()]),
            };
            let Some(legacy) = legacy else {
                valid = false;
                break;
            };
            if context.legacy.len() + legacy.len() > BRANCH_LIMIT {
                valid = false;
                break;
            }
            let suffix = parser::suffix_offset(selector)?.is_some();
            if suffix && !audit.has("EU_MIGRATION_SUFFIX", node.offset) {
                audit.add("EU_MIGRATION_SUFFIX", format!("Expanded selector `{selector}` uses identifier suffix nesting"), node.offset,
                    "Change the generating iterator or placeholder to emit explicit native selectors; generated text cannot be edited automatically.", None);
            }
            let native = if suffix {
                // A syntax finding is already present; descendants can still be checked
                // using explicit legacy parents until the source is rewritten.
                legacy.clone()
            } else if let Some(parent) = parent {
                let parents = format!(":is({})", parent.native.join(", "));
                let Some(native) = expand(selector, &[parents])? else {
                    valid = false;
                    break;
                };
                native
            } else {
                legacy.clone()
            };
            let mut legacy_specs = Vec::new();
            for branch in &legacy {
                audit.selector_work += 1;
                let Some((value, pseudo)) = specificity(branch) else {
                    valid = false;
                    break;
                };
                context.pseudo |= pseudo;
                legacy_specs.push(value);
            }
            if !valid {
                break;
            }
            if !suffix {
                let Some((new, _)) = specificity(&native[0]) else {
                    valid = false;
                    break;
                };
                if let Some((branch, old)) = legacy
                    .iter()
                    .zip(&legacy_specs)
                    .find(|(_, old)| **old != new)
                {
                    audit.add("EU_MIGRATION_SPECIFICITY", format!("`{branch}` changes specificity from {} to {} under native nesting (`{}`)", tuple(*old), tuple(new), native[0]), node.offset,
                        "Keep native behavior intentionally, or flatten the affected subtree into explicit legacy selectors to preserve its specificity. Review surrounding overrides.", None);
                }
            }
            context.legacy.extend(legacy);
            context.native.extend(native);
        }
        if !valid {
            audit.incomplete(node, "Selector syntax or expansion size is outside the migration analyzer's supported range");
            continue;
        }
        walk(children, Some(&context), audit)?;
    }
    Ok(())
}
