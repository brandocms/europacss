use super::{Edit, Report, REPORT_VERSION};
use crate::{sources::Sources, Error, Request};
use serde::Deserialize;
use std::collections::HashMap;

pub(super) fn snapshot(sources: &Sources, request: &Request, from: &str) -> String {
    let mut hash = blake3::Hasher::new();
    let mut add = |bytes: &[u8]| {
        hash.update(&(bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    };
    add(b"europacss-migration-review");
    add(&REPORT_VERSION.to_le_bytes());
    add(from.as_bytes());
    add(&serde_json::to_vec(&request.config).expect("JSON value serializes"));
    add(&serde_json::to_vec(&request.browsers).expect("String list serializes"));
    for (index, file) in sources.files.iter().enumerate() {
        add(file.name.as_bytes());
        add(sources.content(index).as_bytes());
    }
    for (path, content) in &sources.metadata {
        add(path.to_string_lossy().as_bytes());
        add(content.as_bytes());
    }
    hash.finalize().to_hex().to_string()
}

#[derive(Deserialize)]
struct Review {
    report_version: u32,
    snapshot: String,
    from: String,
    to: String,
    analysis_complete: bool,
    #[serde(default)]
    findings: Vec<Decision>,
    #[serde(default)]
    accept_codes: Vec<String>,
}
#[derive(Deserialize)]
struct Decision {
    filename: Option<String>,
    offset: usize,
    code: String,
    message: String,
    #[serde(default)]
    accepted: bool,
    #[serde(default)]
    apply_fix: bool,
}

fn parse_review(source: &str) -> Result<Review, Error> {
    if source.len() > 16 * 1024 * 1024 {
        return Err(Error::new(
            "EU_MIGRATION_REVIEW",
            "Reviewed report exceeds 16 MiB",
            0,
        ));
    }
    serde_json::from_str(source).map_err(|e| {
        Error::new(
            "EU_MIGRATION_REVIEW",
            format!("Invalid reviewed migration report: {e}"),
            0,
        )
    })
}

/// Apply only explicit `accepted: true` semantic decisions from a saved JSON report.
/// The source/config snapshot and analyzer revision must still match exactly.
pub fn apply_acceptances(report: &mut Report, source: &str) -> Result<(), Error> {
    let fail = |message: String| Error::new("EU_MIGRATION_REVIEW", message, 0);
    let review = parse_review(source)?;
    validate_review(report, &review)?;
    if review.findings.iter().any(|f| f.apply_fix) {
        return Err(fail(
            "Use --apply for apply_fix:true decisions, then review a fresh report before --accept"
                .into(),
        ));
    }
    // Validate all decisions before changing any acceptance state.
    let indices = finding_indices(report);
    let mut accepted = Vec::new();
    for decision in review.findings.iter().filter(|f| f.accepted) {
        if !can_accept(&decision.code) {
            return Err(fail(format!("{} is not an acceptable semantic change; resolve this syntax or analysis diagnostic", decision.code)));
        }
        accepted.push(finding_index(&indices, decision)?);
    }
    for code in &review.accept_codes {
        if !can_accept(code) {
            return Err(fail(format!("{code} cannot be accepted by code")));
        }
        let matches: Vec<_> = report
            .findings
            .iter()
            .enumerate()
            .filter(|(_, f)| f.diagnostic.code == *code)
            .map(|(i, _)| i)
            .collect();
        if matches.is_empty() {
            return Err(fail(format!("No findings match accepted code {code}")));
        }
        // The validated analyzer/source/config snapshot binds a compact
        // code-level receipt even when its findings array is omitted.
        accepted.extend(matches);
    }
    for index in accepted {
        report.findings[index].accepted = true;
    }
    Ok(())
}

/// Syntax errors and incomplete analysis cannot be accepted as intentional changes.
pub fn can_accept(code: &str) -> bool {
    matches!(
        code,
        "EU_MIGRATION_SPECIFICITY"
            | "EU_MIGRATION_MATCHING"
            | "EU_MIGRATION_ORDER"
            | "EU_MIGRATION_BUNDLE_ORDER"
            | "EU_MIGRATION_SIZE"
            | "EU_MIGRATION_BREAKPOINT"
            | "EU_MIGRATION_COLUMN_SIGN"
            | "EU_MIGRATION_LEGACY6"
            | "EU_MIGRATION_LEGACY11"
    )
}

fn validate_review(report: &Report, review: &Review) -> Result<(), Error> {
    let fail = |message: String| Error::new("EU_MIGRATION_REVIEW", message, 0);
    if review.report_version != report.report_version
        || review.snapshot != report.snapshot
        || review.from != report.from
        || review.to != report.to
    {
        return Err(fail("Reviewed report is stale or belongs to different inputs/configuration; generate and review a fresh report".into()));
    }
    if !review.analysis_complete || !report.analysis_complete {
        return Err(fail(
            "Incomplete migration analysis cannot be accepted; resolve its diagnostics first"
                .into(),
        ));
    }
    Ok(())
}

type FindingKey<'a> = (Option<&'a str>, usize, &'a str, &'a str);

fn finding_indices(report: &Report) -> HashMap<FindingKey<'_>, usize> {
    report
        .findings
        .iter()
        .enumerate()
        .map(|(index, finding)| {
            let diagnostic = &finding.diagnostic;
            (
                (
                    diagnostic.filename.as_deref(),
                    diagnostic.offset,
                    diagnostic.code.as_str(),
                    diagnostic.message.as_str(),
                ),
                index,
            )
        })
        .collect()
}

fn finding_index(
    indices: &HashMap<FindingKey<'_>, usize>,
    decision: &Decision,
) -> Result<usize, Error> {
    indices
        .get(&(
            decision.filename.as_deref(),
            decision.offset,
            decision.code.as_str(),
            decision.message.as_str(),
        ))
        .copied()
        .ok_or_else(|| {
            Error::new(
                "EU_MIGRATION_REVIEW",
                "A reviewed finding no longer matches the current analysis; review a fresh report",
                0,
            )
        })
}

/// Select proposals from the fresh analysis, never edit contents supplied by the
/// review file. A modified/stale review cannot inject arbitrary file writes.
pub fn reviewed_edits(report: &Report, source: &str) -> Result<Vec<Edit>, Error> {
    let fail = |message: &str| Error::new("EU_MIGRATION_REVIEW", message, 0);
    let review = parse_review(source)?;
    validate_review(report, &review)?;
    if !review.accept_codes.is_empty() || review.findings.iter().any(|f| f.accepted) {
        return Err(fail(
            "Apply proposed fixes first, then accept semantic changes against a fresh report",
        ));
    }
    let mut edits = Vec::new();
    let indices = finding_indices(report);
    let mut selected = std::collections::HashSet::new();
    for decision in review.findings.iter().filter(|f| f.apply_fix) {
        let index = finding_index(&indices, decision)?;
        if !selected.insert(index) {
            continue;
        }
        let finding = &report.findings[index];
        let fix = finding
            .fix
            .as_ref()
            .filter(|f| f.kind == "preserve-appearance")
            .ok_or_else(|| fail("This finding has no appearance-preserving edit proposal"))?;
        edits.extend(fix.edits.clone());
    }
    Ok(edits)
}
