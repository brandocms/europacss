//! Local media compaction. Never reorder simultaneously active rules or cross scopes.
use crate::parser::{self, Node};

pub(crate) fn media(nodes: Vec<Node>) -> Vec<Node> {
    let mut result = Vec::new();
    let mut pending: Option<Group> = None;
    for mut node in nodes {
        if let Some(children) = node.children.take() {
            node.children = Some(media(children));
        }
        let query = node
            .at_rule()
            .and_then(|(name, params)| (name == "media").then_some(params));
        let eligible = node
            .children
            .as_ref()
            .is_some_and(|children| !children.is_empty() && ordinary(children));
        if let Some(query) = query.filter(|_| eligible) {
            let query = query.to_owned();
            if let Some(group) = &mut pending {
                if group.queries.len() == 1 && group.queries[0] == query {
                    // Same condition: keep every declaration and selector in source order.
                    group
                        .node
                        .children
                        .as_mut()
                        .unwrap()
                        .append(node.children.as_mut().unwrap());
                    continue;
                }
                if equivalent(
                    group.node.children.as_ref().unwrap(),
                    node.children.as_ref().unwrap(),
                ) {
                    // Same body: OR the exact conditions, retaining fractional-width gaps.
                    // Collapsing <=739px and >=740px into one range would change 739.5px.
                    group.queries.push(query);
                    continue;
                }
            }
            flush(&mut pending, &mut result);
            pending = Some(Group {
                node,
                queries: vec![query],
            });
        } else {
            flush(&mut pending, &mut result);
            result.push(node);
        }
    }
    flush(&mut pending, &mut result);
    disjoint_widths(result)
}

// A later block may cross only media blocks proven inactive at all of its widths.
// Limit the search so large stylesheets cannot turn this pass into quadratic work.
type WidthRanges = Vec<(f64, f64)>;

fn disjoint_widths(nodes: Vec<Node>) -> Vec<Node> {
    let mut result: Vec<(Node, Option<WidthRanges>)> = Vec::new();
    let mut comparisons = 1_000_000usize;
    for mut node in nodes {
        let ranges = width_ranges(&node);
        let mut merged = false;
        if let Some(ranges) = &ranges {
            for (previous, previous_ranges) in result.iter_mut().rev().take(64) {
                let Some(previous_ranges) = previous_ranges else {
                    break;
                };
                if previous.text == node.text {
                    previous
                        .children
                        .as_mut()
                        .unwrap()
                        .append(node.children.as_mut().unwrap());
                    merged = true;
                    break;
                }
                let may_overlap = ranges.iter().any(|&(low, high)| {
                    previous_ranges.iter().any(|&(other_low, other_high)| {
                        if comparisons == 0 {
                            return true;
                        }
                        comparisons -= 1;
                        low <= other_high && other_low <= high
                    })
                });
                if may_overlap {
                    break;
                }
            }
        }
        if !merged {
            result.push((node, ranges));
        }
    }
    result.into_iter().map(|(node, _)| node).collect()
}

// Deliberately narrow proof language: comma-separated unions of inclusive px
// width comparisons joined with `and`. Anything else is an ordering barrier.
fn width_ranges(node: &Node) -> Option<WidthRanges> {
    let ("media", query) = node.at_rule()? else {
        return None;
    };
    if !ordinary(node.children.as_ref()?) {
        return None;
    }
    let mut ranges = Vec::new();
    let clauses = parser::split_top_level(query, ',').ok()?;
    if clauses.len() > 64 {
        return None;
    }
    for clause in clauses {
        let terms = parser::arguments(clause).ok()?;
        if terms.is_empty() || terms.len() > 15 || terms.len() % 2 == 0 {
            return None;
        }
        let (mut low, mut high): (f64, f64) = (0.0, f64::INFINITY);
        for (i, term) in terms.iter().enumerate() {
            if i % 2 == 1 {
                if *term != "and" {
                    return None;
                }
                continue;
            }
            let inner = term.strip_prefix('(')?.strip_suffix(')')?;
            let values = parser::arguments(inner).ok()?;
            if values.len() != 3 || values[0] != "width" {
                return None;
            }
            let number: f64 = values[2].strip_suffix("px")?.parse().ok()?;
            if !number.is_finite() || number < 0.0 {
                return None;
            }
            match values[1] {
                ">=" => low = low.max(number),
                "<=" => high = high.min(number),
                _ => return None,
            }
        }
        if low > high {
            return None;
        }
        ranges.push((low, high));
    }
    Some(ranges)
}

struct Group {
    node: Node,
    queries: Vec<String>,
}
fn flush(pending: &mut Option<Group>, result: &mut Vec<Node>) {
    if let Some(mut group) = pending.take() {
        group.node.text = format!("@media {}", group.queries.join(", "));
        result.push(group.node);
    }
}
fn ordinary(nodes: &[Node]) -> bool {
    // Keep at-rules with registration, ordering, or unknown behavior out of this pass.
    nodes.iter().all(|node| {
        !node.text.starts_with(['@', '/'])
            && node
                .children
                .as_ref()
                .is_none_or(|children| ordinary(children))
    })
}
fn equivalent(a: &[Node], b: &[Node]) -> bool {
    a.len() == b.len()
        && a.iter().zip(b).all(|(a, b)| {
            a.text == b.text
                && match (&a.children, &b.children) {
                    (None, None) => true,
                    (Some(a), Some(b)) => equivalent(a, b),
                    _ => false,
                }
        })
}
