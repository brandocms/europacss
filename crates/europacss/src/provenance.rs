//! Refine Lightning's rule mappings without changing its CSS transformations.
//! Attribute a property only when all of its normalized longhands have one
//! authored origin in the rule identified by Lightning. Ambiguity keeps the
//! existing rule mapping; values in unrelated rules are never used as evidence.
use crate::parser::{self, Node};
use lightningcss::{
    properties::Property,
    stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleAttribute},
    targets::Targets,
};
use parcel_sourcemap::{OriginalLocation, SourceMap};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct Atom(String, bool);

fn atoms(text: &str, targets: Targets, transform: bool) -> Option<Vec<Atom>> {
    let mut style = StyleAttribute::parse(text, ParserOptions::default()).ok()?;
    if transform {
        style.minify(MinifyOptions {
            targets,
            ..Default::default()
        });
    }
    fn collect(property: &Property<'_>, important: bool, atoms: &mut Vec<Atom>) -> Option<()> {
        if let Some(longhands) = property.property_id().longhands() {
            for id in longhands {
                collect(&property.longhand(&id)?, important, atoms)?;
            }
        } else {
            // A single property may print several vendor-prefixed declarations.
            // Fingerprint each emitted form, preserving its actual prefix.
            let prefixes = property.property_id().prefix();
            let variants = if prefixes.is_empty() {
                vec![property.clone()]
            } else {
                prefixes
                    .into_iter()
                    .map(|prefix| {
                        let mut variant = property.clone();
                        variant.set_prefix(prefix);
                        variant
                    })
                    .collect()
            };
            for variant in variants {
                atoms.push(Atom(
                    variant
                        .to_css_string(
                            false,
                            PrinterOptions {
                                minify: true,
                                ..Default::default()
                            },
                        )
                        .ok()?,
                    important,
                ));
            }
        }
        Some(())
    }
    let mut result = Vec::new();
    for p in &style.declarations.declarations {
        collect(p, false, &mut result)?;
    }
    for p in &style.declarations.important_declarations {
        collect(p, true, &mut result)?;
    }
    (!result.is_empty()).then_some(result)
}

// Resolve node positions in one scan, even for a fully minified single line.
fn positions(source: &str, nodes: &[Node]) -> HashMap<usize, (u32, u32)> {
    fn offsets(nodes: &[Node], out: &mut Vec<usize>) {
        for node in nodes {
            out.push(node.offset);
            if let Some(children) = &node.children {
                offsets(children, out);
            }
        }
    }
    let mut offsets_list = Vec::new();
    offsets(nodes, &mut offsets_list);
    offsets_list.sort_unstable();
    offsets_list.dedup();
    let (mut last, mut line, mut column, mut cr) = (0, 0, 0, false);
    let mut result = HashMap::new();
    for offset in offsets_list {
        for c in source[last..offset].chars() {
            match c {
                '\r' | '\u{c}' => {
                    line += 1;
                    column = 0;
                }
                '\n' => {
                    if !cr {
                        line += 1;
                    }
                    column = 0;
                }
                _ => column += c.len_utf16() as u32,
            }
            cr = c == '\r';
        }
        result.insert(offset, (line, column));
        last = offset;
    }
    result
}

#[derive(Clone)]
struct Origin {
    intermediate: (u32, u32),
    authored: OriginalLocation,
}

#[derive(Default)]
struct Index {
    // Identical paths also cover adjacent identical rules merged by Lightning.
    blocks: HashMap<Vec<String>, HashMap<Atom, Vec<Origin>>>,
    line_paths: HashMap<u32, Vec<String>>,
    cache: HashMap<String, Vec<Atom>>,
}
impl Index {
    fn collect(
        &mut self,
        nodes: &[Node],
        path: &mut Vec<String>,
        locations: &HashMap<usize, (u32, u32)>,
        map: &mut SourceMap,
        targets: Targets,
    ) {
        for node in nodes {
            let position = locations[&node.offset];
            if let Some(children) = &node.children {
                path.push(node.text.clone());
                self.line_paths.insert(position.0, path.clone());
                self.collect(children, path, locations, map, targets);
                path.pop();
            } else if !node.text.starts_with("/*") && node.at_rule().is_none() {
                self.line_paths.insert(position.0, path.clone());
                let Some(authored) = map
                    .find_closest_mapping(position.0, position.1)
                    .and_then(|m| m.original)
                else {
                    continue;
                };
                let values = self.cache.entry(node.text.clone()).or_insert_with(|| {
                    let mut values = atoms(&node.text, targets, false).unwrap_or_default();
                    values.extend(atoms(&node.text, targets, true).unwrap_or_default());
                    let mut seen = HashSet::new();
                    values.retain(|value| seen.insert(value.clone()));
                    values
                });
                let block = self.blocks.entry(path.clone()).or_default();
                for value in values {
                    block.entry(value.clone()).or_default().push(Origin {
                        intermediate: position,
                        authored,
                    });
                }
            }
        }
    }
}

struct Mapping {
    offset: usize,
    intermediate: (u32, u32),
}

struct Parent {
    path: Option<Vec<String>>,
    origin: OriginalLocation,
}

struct Annotation {
    offset: usize,
    position: (u32, u32),
    text: String,
}

/// Add mappings to the intermediate CSS before composing with Europa's source
/// map. Comments are inserted after final printing and shift downstream mappings.
pub(crate) fn refine(
    input: &str,
    output: &mut String,
    map: &mut SourceMap,
    original: &mut SourceMap,
    targets: Targets,
    comments: bool,
) {
    let (Ok(input_nodes), Ok(output_nodes)) = (parser::parse(input), parser::parse(output)) else {
        return;
    };
    let input_positions = positions(input, &input_nodes);
    let output_positions = positions(output, &output_nodes);
    let mut index = Index::default();
    index.collect(
        &input_nodes,
        &mut Vec::new(),
        &input_positions,
        original,
        targets,
    );
    let mut mappings = Vec::new();
    let mut annotations = Vec::new();

    struct Refiner<'a> {
        locations: &'a HashMap<usize, (u32, u32)>,
        map: &'a mut SourceMap,
        original: &'a SourceMap,
        index: &'a Index,
        targets: Targets,
        mappings: &'a mut Vec<Mapping>,
        annotations: &'a mut Vec<Annotation>,
        output: &'a str,
        comments: bool,
    }
    impl Refiner<'_> {
        fn visit(&mut self, nodes: &[Node], parent: Option<&Parent>) {
            for node in nodes {
                let position = self.locations[&node.offset];
                if let Some(children) = &node.children {
                    let parent = self
                        .map
                        .find_closest_mapping(position.0, position.1)
                        .filter(|m| {
                            m.generated_line == position.0 && m.generated_column == position.1
                        })
                        .and_then(|m| m.original)
                        .map(|origin| Parent {
                            path: self.index.line_paths.get(&origin.original_line).cloned(),
                            origin,
                        });
                    if parent.is_none() {
                        self.map.add_mapping(position.0, position.1, None);
                    }
                    // Never inherit attribution across an unmapped nested rule.
                    self.visit(children, parent.as_ref());
                    continue;
                }
                if node.text.starts_with("/*")
                    || node.at_rule().is_some()
                    || !node.text.contains(':')
                {
                    continue;
                }
                let Some(parent) = parent else {
                    self.map.add_mapping(position.0, position.1, None);
                    continue;
                };
                // Reset attribution at every declaration, preventing a preceding
                // precise mapping from spilling onto an ambiguous property.
                self.mappings.push(Mapping {
                    offset: node.offset,
                    intermediate: (parent.origin.original_line, parent.origin.original_column),
                });
                let Some(block) = parent
                    .path
                    .as_ref()
                    .and_then(|path| self.index.blocks.get(path))
                else {
                    continue;
                };
                let Some(values) = atoms(&node.text, self.targets, false) else {
                    continue;
                };
                let mut unique: Option<Origin> = None;
                let mut valid = true;
                let mut font_origin = None;
                for value in &values {
                    let Some(candidates) = block.get(value) else {
                        valid = false;
                        continue;
                    };
                    let first = &candidates[0];
                    if candidates.iter().any(|c| c.authored != first.authored) {
                        valid = false;
                        continue;
                    }
                    if value.0.starts_with("font-size:") {
                        font_origin = Some(first);
                    }
                    if unique
                        .as_ref()
                        .is_some_and(|prior| prior.authored != first.authored)
                    {
                        valid = false;
                    }
                    unique = Some(first.clone());
                }
                if valid {
                    if let Some(origin) = unique {
                        self.mappings.last_mut().unwrap().intermediate = origin.intermediate;
                    }
                }
                if self.comments {
                    if let Some(name) = font_origin
                        .and_then(|o| o.authored.name)
                        .and_then(|n| self.original.get_name(n).ok())
                    {
                        // Prevent tokens containing comment terminators/newlines from
                        // changing CSS syntax; the source-map name retains the exact key.
                        let label = name
                            .replace("*/", "* /")
                            .replace(['\n', '\r', '\u{c}'], " ");
                        let mut end = node.offset + node.text.len();
                        if self.output.as_bytes().get(end) == Some(&b';') {
                            end += 1;
                        }
                        let (lines, column) = crate::emit::position(
                            &self.output[node.offset..end],
                            end - node.offset,
                        );
                        self.annotations.push(Annotation {
                            offset: end,
                            position: (
                                position.0 + lines as u32,
                                column as u32 + if lines == 0 { position.1 } else { 0 },
                            ),
                            text: format!(
                                " /* --ec-font-token: {}; */",
                                serde_json::to_string(&label).expect("string serializes")
                            ),
                        });
                    }
                }
            }
        }
    }
    Refiner {
        locations: &output_positions,
        map,
        original,
        index: &index,
        targets,
        mappings: &mut mappings,
        annotations: &mut annotations,
        output,
        comments,
    }
    .visit(&output_nodes, None);
    for mapping in mappings {
        let (line, column) = output_positions[&mapping.offset];
        let origin = mapping.intermediate;
        // Lightning has one source here: the expanded intermediate stylesheet.
        map.add_mapping(
            line,
            column,
            Some(OriginalLocation::new(origin.0, origin.1, 0, None)),
        );
        // A value lookup should stay on the same declaration too.
        if let Some(colon) = output[mapping.offset..].find(':') {
            let value = mapping.offset + colon + 1;
            let between = &output[mapping.offset..value];
            if !between.contains('\n') {
                map.add_mapping(
                    line,
                    column + between.encode_utf16().count() as u32,
                    Some(OriginalLocation::new(origin.0, origin.1, 0, None)),
                );
            }
        }
    }
    // Reverse insertion keeps original byte offsets valid. Each inserted comment
    // is one line, so only columns at and after that insertion move.
    annotations.sort_by_key(|a| a.offset);
    for annotation in annotations.into_iter().rev() {
        let (line, column) = annotation.position;
        if map
            .offset_columns(line, column, annotation.text.encode_utf16().count() as i64)
            .is_ok()
        {
            output.insert_str(annotation.offset, &annotation.text);
        }
    }
}
