use super::{selectors, Audit, Edit, Fix};
use crate::{
    emit,
    parser::{self, Node},
    Error,
};

fn simple_selector(selector: &str) -> bool {
    selector.starts_with(['.', '#'])
        && selector.len() <= 256
        && selector.len() > 1
        && selector[1..]
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
        && selectors::specificity(selector).is_some()
}

fn flatten(children: &[Node], selector: &str, output: &mut Vec<Node>) -> Option<()> {
    let mut declarations = Vec::new();
    fn flush(declarations: &mut Vec<Node>, selector: &str, output: &mut Vec<Node>) {
        if !declarations.is_empty() {
            output.push(Node::block(selector, std::mem::take(declarations), 0));
        }
    }
    for child in children {
        if let Some(body) = &child.children {
            flush(&mut declarations, selector, output);
            if let Some((name, _)) = child.at_rule() {
                if !matches!(name, "media" | "supports" | "container") {
                    return None;
                }
                let mut nested = Vec::new();
                flatten(body, selector, &mut nested)?;
                output.push(Node::block(&child.text, nested, child.offset));
            } else {
                let suffix = child.text.strip_prefix('&')?;
                if suffix.is_empty()
                    || !suffix
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-'))
                {
                    return None;
                }
                let selector = format!("{selector}{suffix}");
                if !simple_selector(&selector) {
                    return None;
                }
                flatten(body, &selector, output)?;
            }
        } else {
            if child.at_rule().is_some() {
                return None;
            }
            declarations.push(child.clone());
        }
    }
    flush(&mut declarations, selector, output);
    Some(())
}

fn suffixes<'a>(nodes: &'a [Node], out: &mut Vec<&'a Node>) -> Result<(), Error> {
    for node in nodes {
        if let Some(children) = &node.children {
            if node.at_rule().is_none() && parser::suffix_offset(&node.text)?.is_some() {
                out.push(node);
            }
            suffixes(children, out)?;
        }
    }
    Ok(())
}

pub(super) fn collect(
    nodes: &[Node],
    inside_style: bool,
    audit: &mut Audit<'_>,
) -> Result<(), Error> {
    for node in nodes {
        let Some(children) = &node.children else {
            continue;
        };
        if let Some((name, _)) = node.at_rule() {
            if name == "nest" {
                audit.add("EU_MIGRATION_NEST", "Legacy @nest must become a native nested selector", node.offset,
                    "Remove @nest, retain its selector, and review nesting specificity before accepting the result.", None);
            }
            collect(children, inside_style, audit)?;
            continue;
        }
        if inside_style {
            collect(children, true, audit)?;
            continue;
        } // The outer style owns all suffix findings and its proposed edit.
        collect(children, true, audit)?;
        let mut affected = Vec::new();
        suffixes(children, &mut affected)?;
        if parser::suffix_offset(&node.text)?.is_some() {
            affected.push(node);
        }
        if affected.is_empty() {
            continue;
        }
        let mut flat = Vec::new();
        let fix = if affected.len() <= 64
            && simple_selector(&node.text)
            && flatten(children, &node.text, &mut flat).is_some()
        {
            let index = audit.sources.index(node.offset);
            let source = audit.sources.content(index);
            let start = node.offset - audit.sources.files[index].start;
            let end = parser::block_end(source, start)?;
            let replacement = emit::emit(&flat, audit.sources, false).css;
            let bytes = (end - start + replacement.len()).saturating_mul(affected.len());
            if audit.fix_bytes.saturating_add(bytes) > 8 * 1024 * 1024 {
                None
            } else {
                audit.fix_bytes += bytes;
                Some(Fix { description: "Flatten this plain-CSS suffix subtree in place, retaining declaration order and enclosing conditions".into(), kind: "syntax".into(), edits: vec![Edit { filename: audit.sources.files[index].name.clone(), start, end, expected: source[start..end].into(), replacement }] })
            }
        } else {
            None
        };
        for child in affected {
            audit.add("EU_MIGRATION_SUFFIX", format!("`{}` uses identifier suffix nesting, which native CSS does not support", child.text), child.offset,
                if fix.is_some() { "A syntax-only autofix is available; review the explicit selectors before migrating the site." } else { "Flatten this subtree manually. Automatic fixes currently require one plain class/ID parent, suffix-only child selectors, and CSS declarations/conditions without Europa directives." }, fix.clone());
        }
    }
    Ok(())
}
