//! Local media compaction. Never move rules past siblings or across enclosing scopes.
use crate::parser::Node;

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
    result
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
