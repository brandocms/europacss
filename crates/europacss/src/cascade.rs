//! Europa's cascade policy: common rules precede responsive rules in each scope.
//!
//! Split selector trees instead of flattening selectors. This keeps native nesting
//! specificity, pseudo-elements, source locations, and enclosing conditions intact.
//! Media queries retain their relative order; this is not a breakpoint sort.
use crate::parser::Node;

pub(crate) fn media_last(nodes: Vec<Node>) -> Vec<Node> {
    partition(nodes).joined()
}

#[derive(Default)]
struct Partition {
    common: Vec<Node>,
    responsive: Vec<Node>,
    // Layer registration and unknown rules must not move across pending media.
    // Propagate this boundary through selectors and enclosing conditional groups.
    boundary: bool,
}

impl Partition {
    fn joined(mut self) -> Vec<Node> {
        self.common.append(&mut self.responsive);
        self.common
    }

    fn barrier(&mut self, node: Node) {
        self.common.append(&mut self.responsive);
        self.common.push(node);
        self.boundary = true;
    }
}

fn partition(nodes: Vec<Node>) -> Partition {
    let mut result = Partition::default();
    for mut node in nodes {
        let name = node.at_rule().map(|(name, _)| name.to_ascii_lowercase());
        match name.as_deref() {
            Some("media" | "supports" | "container" | "scope" | "starting-style" | "layer")
                if node.children.is_some() =>
            {
                let children = partition(node.children.take().unwrap());
                let boundary = children.boundary || name.as_deref() == Some("layer");
                node.children = Some(children.joined());
                if boundary {
                    result.barrier(node);
                } else if name.as_deref() == Some("media") {
                    result.responsive.push(node);
                } else {
                    // Order inside the group, but never lift its media outside it.
                    result.common.push(node);
                }
            }
            Some("keyframes" | "-webkit-keyframes" | "font-face" | "property") => {
                // Registrations are independent of style-rule order. Preserve their
                // relative order without splitting the scope's responsive tail.
                // Descriptor/keyframe blocks are not selector trees.
                result.common.push(node);
            }
            Some(_) => {
                // Imports, layer statements and unknown at-rules remain barriers.
                result.barrier(node);
            }
            None if node.children.is_some() => {
                let children = partition(node.children.take().unwrap());
                if children.boundary {
                    node.children = Some(children.joined());
                    result.barrier(node);
                } else if children.responsive.is_empty() {
                    node.children = Some(children.common);
                    result.common.push(node);
                } else {
                    if !children.common.is_empty() {
                        let mut common = node.clone();
                        common.children = Some(children.common);
                        result.common.push(common);
                    }
                    node.children = Some(children.responsive);
                    result.responsive.push(node);
                }
            }
            None => result.common.push(node),
        }
    }
    result
}
