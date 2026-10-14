//! Versioned, read-only migration analysis and explicitly classified source edits.
//! A clean report is not a computed-style or rendered-page equivalence proof.
mod fixes;
pub(crate) mod legacy11;
pub(crate) mod legacy6;
mod order;
mod review;
mod selectors;

pub use review::{apply_acceptances, can_accept, reviewed_edits};

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
pub const LEGACY_BETA6: &str = "1.0.0-beta.6";
pub const LEGACY_BETA11: &str = "1.0.0-beta.11";
pub const REPORT_VERSION: u32 = 10;

#[derive(Clone, Debug, Eq, Hash, PartialEq, Serialize)]
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

/// Structured evidence for presentation only. Finding identity and review
/// decisions use the diagnostic rather than this optional presentation metadata.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct OrderSource {
    pub filename: Option<String>,
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}
impl From<Error> for OrderSource {
    fn from(error: Error) -> Self {
        Self {
            filename: error.filename,
            offset: error.offset,
            line: error.line,
            column: error.column,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct OrderConflict {
    pub earlier_source: OrderSource,
    pub earlier_label: String,
    pub earlier: String,
    pub later: String,
    pub earlier_conditions: Vec<String>,
    pub later_conditions: Vec<String>,
    pub reason: String,
    pub selector_path: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct Finding {
    #[serde(flatten)]
    pub diagnostic: Error,
    pub help: String,
    /// Explicitly reviewed semantic change; syntax errors cannot be accepted.
    pub accepted: bool,
    /// Explicit opt-in to the proposed edit when replaying a reviewed report.
    pub apply_fix: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix: Option<Fix>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<OrderConflict>,
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
    /// Exact analyzed contents for local review previews; never part of saved JSON.
    #[serde(skip)]
    pub sources: std::collections::BTreeMap<String, String>,
}

fn version(from: &str) -> Result<(), Error> {
    if !matches!(from, LEGACY_VERSION | LEGACY_BETA6 | LEGACY_BETA11) {
        return Err(Error::new("EU_MIGRATION_VERSION", format!("Migration currently models EuropaCSS {LEGACY_BETA6}, {LEGACY_BETA11} and {LEGACY_VERSION}; received `{from}`. No assumptions were made about another version."), 0));
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
    let mut config = Config::new(&request.config)?;
    config.migration_warnings = Some(std::cell::RefCell::default());
    config.migration_beta6 = from == LEGACY_BETA6;
    config.migration_beta11 = from == LEGACY_BETA11;
    let mut audit = Audit {
        sources: &sources,
        findings: Vec::new(),
        complete: true,
        seen: HashSet::new(),
        selector_work: 0,
        fix_bytes: 0,
        order_fixes: std::collections::HashMap::new(),
    };
    bundle_placement(&nodes, false, &mut audit);
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
        if from == LEGACY_VERSION {
            fixes::order_candidates(&file_nodes, &mut audit)?;
        }
    }
    let origins = order::origins(&nodes, &config)?;
    match transform::for_migration(nodes, &config) {
        Ok(expanded) => {
            selectors::walk(&expanded, None, &mut audit)?;
            order::walk(&expanded, &origins, &mut audit)?;
            order::repeated_selectors(&expanded, &mut audit);
        }
        Err(error) => {
            audit.complete = false;
            audit.add("EU_MIGRATION_INCOMPLETE", format!("Expansion stopped: [{}] {}", error.code, error.message), error.offset,
                "Resolve this compiler diagnostic and rerun migration; generated selectors have not been fully checked.", None);
        }
    }
    for warning in config.migration_warnings.unwrap().into_inner().items {
        if warning.code == "EU_MIGRATION_BREAKPOINT" {
            audit.add(&warning.code, warning.message, warning.offset,
                "This closes the legacy one-pixel gap. Review widths immediately below the next breakpoint and accept the correction. Authored CSS media queries and explicit pixel arrow ranges are unchanged; --fix does not rewrite them.", None);
            continue;
        }
        if warning.code == "EU_MIGRATION_LEGACY11" {
            audit.add(&warning.code, warning.message, warning.offset,
                "Review this beta.11-specific change against the old output. Keep the new behavior intentionally, or use explicit CSS/config values preserving the old result. No automatic appearance edit is proposed for beta.11.", None);
            continue;
        }
        if warning.code == "EU_MIGRATION_LEGACY6" {
            audit.add(&warning.code, warning.message, warning.offset,
                "Review this beta.6-specific change against the old output. Keep the new behavior intentionally, or replace it with explicit CSS/config values preserving the old result. No automatic appearance edit is proposed for beta.6.", None);
            continue;
        }
        if warning.code == "EU_MIGRATION_INCOMPLETE" {
            audit.complete = false;
        }
        if warning.code == "EU_MIGRATION_COLUMN_SIGN" {
            audit.add(&warning.code, warning.message, warning.offset,
                "Existing output is preserved. To make the intent explicit, replace the fraction with the suggested calc() at each breakpoint, or choose negate(value) after reviewing the visual change. No automatic edit is made: column-count offsets and whole-width negation are different operations.", None);
            continue;
        }
        audit.add(&warning.code, warning.message, warning.offset,
            "Review the resolved sizes at the affected viewport widths. Accept the corrected formula intentionally, or replace the affected value with explicit CSS that preserves the old result. --fix never changes sizing formulas.", None);
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
            "bundle-placement".into(),
            "nesting-specificity".into(),
            "nested-pseudo-elements".into(),
            "repeated-nesting-combinators".into(),
            "local-declaration-order".into(),
            "repeated-selector-media-order".into(),
            "overlapping-width-media-order".into(),
            "resolved-sizing-corrections".into(),
            "contiguous-breakpoint-boundaries".into(),
            "signed-column-intent".into(),
            match from { LEGACY_BETA6 => "beta6-feature-and-sizing-changes", LEGACY_BETA11 => "beta11-feature-and-sizing-changes", _ => "beta16-profile" }.into(),
        ],
        analysis_complete: audit.complete,
        limitations: vec![
            "No DOM, computed-style, or rendered-page comparison".into(),
            "General selector matching equivalence inside functional pseudo-classes is not modeled".into(),
            "Cross-selector cascade, arbitrary condition overlap, global duplicate-selector/media sorting, and logical/physical property interactions are not modeled".into(),
            "Other sizing differences (including calculation grouping) and backend/browser-target changes require separate review".into(),
            "Configuration must represent the resolved legacy values; beta.6 and beta.11 did not resolve {token.references}. Appearance edit proposals are available for beta.16 only".into(),
        ],
        findings: audit.findings,
        sources: sources.files.iter().enumerate().map(|(i, file)| (file.name.clone(), sources.content(i).to_owned())).collect(),
    })
}

fn bundle_placement(nodes: &[Node], nested: bool, audit: &mut Audit<'_>) {
    let mut preceding = false;
    for node in nodes {
        if node.at_rule().is_some_and(|(name, params)| {
            name == "europa" && matches!(params.trim(), "base" | "arrows")
        }) && (nested || preceding)
        {
            audit.add("EU_MIGRATION_BUNDLE_ORDER", "Legacy @europa bundles were prepended to the stylesheet root; native bundles expand at their authored position and retain enclosing conditions/layers", node.offset,
                "Review reset/arrow precedence. To preserve legacy placement, put the bundles before authored style rules, in reverse of their old encounter order (normally base then arrows). Keep leading external imports first. Do not move a conditional bundle without reviewing its newly retained condition.", None);
        }
        if node.at_rule().is_some_and(|(name, _)| {
            matches!(
                name,
                "media" | "supports" | "layer" | "container" | "scope" | "document"
            )
        }) {
            if let Some(children) = &node.children {
                bundle_placement(children, true, audit);
            }
        }
        if !node.text.starts_with("/*")
            && !node
                .at_rule()
                .is_some_and(|(name, _)| matches!(name, "charset" | "import"))
        {
            preceding = true;
        }
    }
}

struct Audit<'a> {
    sources: &'a Sources,
    findings: Vec<Finding>,
    complete: bool,
    seen: HashSet<(String, usize, String)>,
    selector_work: usize,
    fix_bytes: usize,
    order_fixes: std::collections::HashMap<(usize, usize), Fix>,
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
        // Findings are evidence, not a work budget. Keep every unique result;
        // selector expansion and declaration comparisons have their own limits.
        let message = message.into();
        if !self.seen.insert((code.into(), offset, message.clone())) {
            return;
        }
        self.findings.push(Finding {
            diagnostic: self.sources.locate(Error::new(code, message, offset)),
            help: help.into(),
            accepted: false,
            apply_fix: false,
            fix,
            order: None,
        });
    }
    fn add_order(
        &mut self,
        message: String,
        offset: usize,
        help: &str,
        fix: Option<Fix>,
        order: OrderConflict,
    ) {
        let before = self.findings.len();
        self.add("EU_MIGRATION_ORDER", message, offset, help, fix);
        if self.findings.len() > before {
            self.findings.last_mut().unwrap().order = Some(order);
        }
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
