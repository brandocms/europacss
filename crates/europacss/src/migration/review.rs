use super::{Edit, Report, REPORT_VERSION};
use crate::{sources::Sources, Error, Request};
use serde::Deserialize;

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
    hash.finalize().to_hex().to_string()
}

#[derive(Deserialize)]
struct Review {
    report_version: u32,
    snapshot: String,
    from: String,
    to: String,
    analysis_complete: bool,
    findings: Vec<Decision>,
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
        return Err(fail("Use --apply-fixes for apply_fix:true decisions, then review a fresh report before --accept".into()));
    }
    // Validate all decisions before changing any acceptance state.
    let mut accepted = Vec::new();
    for decision in review.findings.iter().filter(|f| f.accepted) {
        if !matches!(
            decision.code.as_str(),
            "EU_MIGRATION_SPECIFICITY"
                | "EU_MIGRATION_MATCHING"
                | "EU_MIGRATION_ORDER"
                | "EU_MIGRATION_SIZE"
                | "EU_MIGRATION_COLUMN_SIGN"
                | "EU_MIGRATION_LEGACY6"
        ) {
            return Err(fail(format!("{} is not an acceptable semantic change; resolve this syntax or analysis diagnostic", decision.code)));
        }
        accepted.push(finding_index(report, decision)?);
    }
    for index in accepted {
        report.findings[index].accepted = true;
    }
    Ok(())
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

fn finding_index(report: &Report, decision: &Decision) -> Result<usize, Error> {
    report
        .findings
        .iter()
        .position(|finding| {
            let diagnostic = &finding.diagnostic;
            diagnostic.filename == decision.filename
                && diagnostic.offset == decision.offset
                && diagnostic.code == decision.code
                && diagnostic.message == decision.message
        })
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
    if review.findings.iter().any(|f| f.accepted) {
        return Err(fail(
            "Apply proposed fixes first, then accept semantic changes against a fresh report",
        ));
    }
    let mut edits = Vec::new();
    let mut selected = std::collections::HashSet::new();
    for decision in review.findings.iter().filter(|f| f.apply_fix) {
        let index = finding_index(report, decision)?;
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
