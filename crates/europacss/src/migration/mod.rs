//! Versioned, read-only migration analysis and explicitly classified source edits.
//! A clean report is not a computed-style or rendered-page equivalence proof.
mod fixes;
mod order;
mod review;
mod selectors;

pub use review::apply_acceptances;

use crate::{
    config::Config,
    imports,
    parser::{self, Node},
    sources::Sources,
    transform, Error, Request,
};
use serde::Serialize;
use std::{collections::HashSet, path::Path};

pub const LEGACY_VERSION: &str = "1.0.0-beta.16";
pub const REPORT_VERSION: u32 = 1;

#[derive(Clone, Debug, Serialize)]
pub struct Edit {
    pub filename: String,
    /// UTF-8 byte offsets into the original file, end exclusive.
    pub start: usize,
    pub end: usize,
    pub expected: String,
    pub replacement: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Fix {
    pub description: String,
    /// Only syntax fixes may be selected by --fix. Appearance choices remain explicit.
    pub kind: String,
    pub edits: Vec<Edit>,
}

#[derive(Debug, Serialize)]
pub struct Finding {
    #[serde(flatten)]
    pub diagnostic: Error,
    pub help: String,
    /// Explicitly reviewed semantic change; syntax errors cannot be accepted.
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<Fix>,
}

#[derive(Debug, Serialize)]
pub struct Report {
    pub report_version: u32,
    /// Binds review decisions to the complete input/config snapshot.
    pub snapshot: String,
    pub from: String,
    pub to: String,
    pub files: Vec<String>,
    pub checks: Vec<String>,
    pub limitations: Vec<String>,
    /// Whether the listed checks ran without unsupported input or expansion limits.
    pub analysis_complete: bool,
    pub findings: Vec<Finding>,
}

fn version(from: &str) -> Result<(), Error> {
    if from != LEGACY_VERSION {
        return Err(Error::new("EU_MIGRATION_VERSION", format!("Migration currently models EuropaCSS {LEGACY_VERSION}; received `{from}`. No assumptions were made about another version."), 0));
    }
    Ok(())
}

pub fn analyze(request: &Request, from: &str) -> Result<Report, Error> {
    version(from)?;
    let mut sources = Sources::default();
    sources.add(request.filename.clone(), &request.source);
    let nodes = parser::parse(&request.source).map_err(|e| sources.locate(e))?;
    imports::validate_external_order(&nodes).map_err(|e| sources.locate(e))?;
    report(nodes, sources, request, from)
}

/// Analyze the entry and its local imports without changing any file.
pub fn analyze_file(request: &Request, from: &str) -> Result<Report, Error> {
    version(from)?;
    if !request.source.is_empty() {
        return Err(Error::new(
            "EU_INPUT",
            "File migration reads filename; source must be empty",
            0,
        ));
    }
    let loaded = imports::load(Path::new(&request.filename), None)?;
    report(loaded.nodes, loaded.sources, request, from)
}

fn report(
    nodes: Vec<Node>,
    sources: Sources,
    request: &Request,
    from: &str,
) -> Result<Report, Error> {
    let config = Config::new(&request.config)?;
    let mut audit = Audit {
        sources: &sources,
        findings: Vec::new(),
        complete: true,
        seen: HashSet::new(),
        selector_work: 0,
        fix_bytes: 0,
    };
    // Collect authored syntax fixes before expansion, so edits never target generated text.
    for index in 0..sources.files.len() {
        let mut file_nodes =
            parser::parse(sources.content(index)).map_err(|e| sources.locate(e))?;
        fn shift(nodes: &mut [Node], start: usize) {
            for node in nodes {
                node.offset += start;
                if let Some(children) = &mut node.children {
                    shift(children, start);
                }
            }
        }
        shift(&mut file_nodes, sources.files[index].start);
        fixes::collect(&file_nodes, false, &mut audit)?;
    }
    let origins = order::origins(&nodes, &config)?;
    match transform::for_migration(nodes, &config) {
        Ok(expanded) => {
            selectors::walk(&expanded, None, &mut audit)?;
            order::walk(&expanded, &origins, &mut audit)?;
        }
        Err(error) => {
            audit.complete = false;
            audit.add("EU_MIGRATION_INCOMPLETE", format!("Expansion stopped: [{}] {}", error.code, error.message), error.offset,
                "Resolve this compiler diagnostic and rerun migration; generated selectors have not been fully checked.", None);
        }
    }
    audit.findings.sort_by(|a, b| {
        (
            &a.diagnostic.filename,
            a.diagnostic.offset,
            &a.diagnostic.code,
        )
            .cmp(&(
                &b.diagnostic.filename,
                b.diagnostic.offset,
                &b.diagnostic.code,
            ))
    });
    Ok(Report {
        report_version: REPORT_VERSION,
        snapshot: review::snapshot(&sources, request, from),
        from: from.into(),
        to: "rust-native-nesting".into(),
        files: sources.files.iter().map(|f| f.name.clone()).collect(),
        checks: vec![
            "suffix-syntax".into(),
            "nesting-specificity".into(),
            "nested-pseudo-elements".into(),
            "repeated-nesting-combinators".into(),
            "local-declaration-order".into(),
        ],
        analysis_complete: audit.complete,
        limitations: vec![
            "No DOM, computed-style, or rendered-page comparison".into(),
            "General selector matching equivalence inside functional pseudo-classes is not modeled".into(),
            "Cross-selector cascade, arbitrary condition overlap, global duplicate-selector/media sorting, and logical/physical property interactions are not modeled".into(),
            "Sizing formula corrections and backend/browser-target differences require separate review".into(),
        ],
        findings: audit.findings,
    })
}

struct Audit<'a> {
    sources: &'a Sources,
    findings: Vec<Finding>,
    complete: bool,
    seen: HashSet<(String, usize, String)>,
    selector_work: usize,
    fix_bytes: usize,
}
impl Audit<'_> {
    fn has(&self, code: &str, offset: usize) -> bool {
        self.seen
            .iter()
            .any(|(c, at, _)| c == code && *at == offset)
    }
    fn add(
        &mut self,
        code: &str,
        message: impl Into<String>,
        offset: usize,
        help: &str,
        fix: Option<Fix>,
    ) {
        if self.findings.len() >= 512 {
            self.complete = false;
            if self.findings.len() == 512 {
                self.findings.push(Finding {
                    diagnostic: self.sources.locate(Error::new(
                        "EU_MIGRATION_INCOMPLETE",
                        "Migration report reached its 512-finding limit",
                        offset,
                    )),
                    help: "Resolve findings and rerun, or audit smaller entry points.".into(),
                    accepted: false,
                    fix: None,
                });
            }
            return;
        }
        let message = message.into();
        if !self.seen.insert((code.into(), offset, message.clone())) {
            return;
        }
        self.findings.push(Finding {
            diagnostic: self.sources.locate(Error::new(code, message, offset)),
            help: help.into(),
            accepted: false,
            fix,
        });
    }
    fn incomplete(&mut self, node: &Node, reason: &str) {
        self.complete = false;
        self.add(
            "EU_MIGRATION_INCOMPLETE",
            reason,
            node.offset,
            "Review this selector subtree manually; it was not certified by this analysis.",
            None,
        );
    }
}

/// Apply a reviewed set of edits to one source snapshot. This never writes files.
pub fn apply_edits(source: &str, filename: &str, edits: &[Edit]) -> Result<String, Error> {
    let mut edits: Vec<_> = edits.iter().filter(|e| e.filename == filename).collect();
    edits.sort_by_key(|e| (e.start, e.end));
    edits.dedup_by(|a, b| a.start == b.start && a.end == b.end && a.replacement == b.replacement);
    let mut result = String::new();
    let mut at = 0;
    for edit in edits {
        if edit.start < at
            || edit.end < edit.start
            || edit.end > source.len()
            || !source.is_char_boundary(edit.start)
            || !source.is_char_boundary(edit.end)
        {
            return Err(Error::new(
                "EU_MIGRATION_EDIT",
                "Overlapping or invalid source edits",
                edit.start,
            ));
        }
        if source[edit.start..edit.end] != edit.expected {
            return Err(Error::new(
                "EU_MIGRATION_EDIT",
                "Source changed since this edit was analyzed; rerun migration",
                edit.start,
            ));
        }
        result.push_str(&source[at..edit.start]);
        result.push_str(&edit.replacement);
        at = edit.end;
    }
    result.push_str(&source[at..]);
    parser::parse(&result)?;
    Ok(result)
}
