//! Explicit selector expansion with per-parent-branch specificity and matching.
use crate::{
    migration::selectors::expand,
    parser::{self, Node},
    Error,
};

pub(crate) fn apply(nodes: Vec<Node>, config: &serde_json::Value) -> Result<Vec<Node>, Error> {
    if config.get("nesting").and_then(|v| v.as_str()) != Some("expanded") {
        return Ok(nodes);
    }
    Flattener { work: 0, bytes: 0 }.walk(nodes, None)
}

struct Parent {
    selectors: Vec<String>,
    offset: usize,
}
struct Flattener {
    work: usize,
    bytes: usize,
}

fn limit(offset: usize) -> Error {
    Error::new("EU_NESTING_LIMIT", "Selector expansion exceeds its budget (256 branches per rule, 16384 bytes per selector, 50000 branches or 16 MiB total); simplify or flatten the source explicitly", offset)
}

impl Flattener {
    fn flush(
        &mut self,
        declarations: &mut Vec<Node>,
        parent: Option<&Parent>,
        result: &mut Vec<Node>,
    ) -> Result<(), Error> {
        if declarations.is_empty() {
            return Ok(());
        }
        if let Some(parent) = parent {
            let text = parent.selectors.join(", ");
            self.bytes = self.bytes.saturating_add(text.len());
            if self.bytes > 16 * 1024 * 1024 {
                return Err(limit(parent.offset));
            }
            result.push(Node::block(
                text,
                std::mem::take(declarations),
                parent.offset,
            ));
        } else {
            result.append(declarations);
        }
        Ok(())
    }

    fn walk(&mut self, nodes: Vec<Node>, parent: Option<&Parent>) -> Result<Vec<Node>, Error> {
        let mut result = Vec::new();
        let mut declarations = Vec::new();
        for mut node in nodes {
            let Some(children) = node.children.take() else {
                declarations.push(node);
                continue;
            };
            self.flush(&mut declarations, parent, &mut result)?;
            if let Some((name, _)) = node.at_rule() {
                let name = name.to_ascii_lowercase();
                if matches!(
                    name.as_str(),
                    "media" | "supports" | "container" | "layer" | "starting-style" | "scope"
                ) {
                    if name == "scope" && parent.is_some() {
                        return Err(Error::new("EU_EXPANDED_NESTING", "Nested @scope requires explicit source flattening in expanded nesting mode", node.offset));
                    }
                    node.children = Some(self.walk(children, parent)?);
                    result.push(node);
                } else {
                    node.children = Some(children);
                    // Preserve descriptors/unknown rules without treating their
                    // bodies as selectors. The backend validates their context.
                    declarations.push(node);
                    self.flush(&mut declarations, parent, &mut result)?;
                }
                continue;
            }
            let mut selectors = Vec::new();
            for selector in parser::split_top_level(&node.text, ',')? {
                let branches = match parent {
                    Some(parent) => {
                        expand(selector, &parent.selectors)?.ok_or_else(|| limit(node.offset))?
                    }
                    None => vec![selector.to_owned()],
                };
                selectors.extend(branches);
                if selectors.len() > 256 || selectors.iter().any(|s| s.len() > 16_384) {
                    return Err(limit(node.offset));
                }
            }
            self.work += selectors.len();
            if self.work > 50_000 {
                return Err(limit(node.offset));
            }
            result.extend(self.walk(
                children,
                Some(&Parent {
                    selectors,
                    offset: node.offset,
                }),
            )?);
        }
        self.flush(&mut declarations, parent, &mut result)?;
        Ok(result)
    }
}
