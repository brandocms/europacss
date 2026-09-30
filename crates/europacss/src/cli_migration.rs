pub(crate) mod display;

use crate::cli_output::{MigrationSummary, Ui};
use europacss::{migration, Request};
use std::{fs, io::Write, path::Path, process::ExitCode};

pub fn run(args: Vec<String>, ui: &Ui) -> Result<ExitCode, String> {
    let mut input = None;
    let mut config_path = None;
    let mut from = None;
    let mut accept = None;
    let mut apply_fixes = None;
    let mut fix = false;
    let mut check = false;
    let mut json = false;
    let mut summary = false;
    let mut details = false;
    let mut studio = false;
    let mut port = None;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--from" => from = Some(args.next().ok_or("--from needs a source version")?),
            "--config" => config_path = Some(args.next().ok_or("--config needs a path")?),
            "--accept" => {
                accept = Some(args.next().ok_or("--accept needs a reviewed JSON report")?)
            }
            "--apply" | "--apply-fixes" => {
                apply_fixes = Some(
                    args.next()
                        .ok_or_else(|| format!("{arg} needs a reviewed JSON report"))?,
                )
            }
            "--fix" => fix = true,
            "--check" => check = true,
            "--json" => json = true,
            "--summary" => summary = true,
            "--details" => details = true,
            "--studio" => studio = true,
            "--port" => port = Some(args.next().ok_or("--port needs a number")?),
            "--help" | "-h" => {
                println!("Supported source versions: 1.0.0-beta.6, 1.0.0-beta.11, 1.0.0-beta.16");
                println!("Browser review: europa migrate <entry.css> --from <version> [--config europa.json5] --studio [--port 0]\n");
                println!("Usage: europa migrate <entry.css> --from 1.0.0-beta.16 [--config europa.json5] [--check | --fix] [--json | --summary | --details] [--accept review.json | --apply review.json]\n\nChecks the entry and local imports. Default: read-only --check, grouped by source location and diagnostic code.\n--fix applies supported suffix syntax edits; appearance choices remain unresolved.\n--apply applies only proposals marked apply_fix:true in a saved report, then reruns analysis (--apply-fixes is an alias).\n--accept reads explicit accepted:true decisions from a saved JSON report for these exact inputs.\n--summary lists review-item and finding counts by file and diagnostic code.\n--details prints every unresolved finding separately. Grouping never skips checks or accepts findings.\nExit 1 means findings remain unresolved or analysis could not finish. --json writes the full report to stdout.\nA clean report covers the listed checks; rendered-page comparison is still required.");
                return Ok(ExitCode::SUCCESS);
            }
            _ if arg.starts_with('-') => return Err(format!("Unknown migration option: {arg}")),
            _ => {
                if input.replace(arg).is_some() {
                    return Err(
                        "Migration accepts one entry stylesheet; its local imports are included"
                            .into(),
                    );
                }
            }
        }
    }
    if fix && check {
        return Err("Choose --check or --fix".into());
    }
    if [summary, json, details]
        .into_iter()
        .filter(|flag| *flag)
        .count()
        > 1
    {
        return Err("Choose one output mode: --summary, --details, or --json".into());
    }
    if fix && accept.is_some() {
        return Err("Apply syntax fixes first, then review a fresh report with --accept".into());
    }
    if apply_fixes.is_some() && (fix || check || accept.is_some()) {
        return Err("Use --apply separately from --check, --fix, and --accept".into());
    }
    let input = input.ok_or("migrate requires an entry stylesheet")?;
    let from = from.ok_or("migrate requires --from: the installed version does not prove which semantics these files were authored against")?;
    if studio {
        if fix || apply_fixes.is_some() || accept.is_some() || json || summary || details || check {
            return Err(
                "Use --studio on its own; review, save, and apply decisions in the browser".into(),
            );
        }
        let mut args = vec!["--entry".into(), input, "--from".into(), from];
        if let Some(path) = config_path {
            args.extend(["--config".into(), path]);
        }
        if let Some(port) = port {
            args.extend(["--port".into(), port]);
        }
        return crate::cli_studio::run(args, ui).map(|_| ExitCode::SUCCESS);
    }
    if port.is_some() {
        return Err("--port requires --studio".into());
    }
    let config = match config_path {
        Some(path) => europacss::load_config(Path::new(&path))?,
        None => europacss::resolve_config(serde_json::json!({})).map_err(|e| e.to_string())?,
    };
    let request = Request {
        filename: input.clone(),
        config,
        ..Request::default()
    };
    let mut report = migration::analyze_file(&request, &from)
        .map_err(|e| ui.diagnostic(&e, &input, None, false))?;
    let mut changed = 0;
    if fix || apply_fixes.is_some() {
        let edits: Vec<_> = if let Some(path) = apply_fixes {
            let source = fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))?;
            migration::reviewed_edits(&report, &source).map_err(|e| e.to_string())?
        } else {
            report
                .findings
                .iter()
                .filter_map(|f| f.fix.as_ref())
                .filter(|f| f.kind == "syntax")
                .flat_map(|f| f.edits.clone())
                .collect()
        };
        // Prepare and validate every rewrite before any file is replaced.
        let mut prepared = Vec::new();
        for filename in &report.files {
            if !edits.iter().any(|e| &e.filename == filename) {
                continue;
            }
            let original = fs::read_to_string(filename).map_err(|e| format!("{filename}: {e}"))?;
            let replacement =
                migration::apply_edits(&original, filename, &edits).map_err(|e| e.to_string())?;
            if original != replacement {
                prepared.push((filename.clone(), original, replacement));
            }
        }
        for (index, (filename, original, replacement)) in prepared.iter().enumerate() {
            replace(Path::new(filename), original, replacement, index)?;
            changed += 1;
        }
        if changed > 0 {
            report = migration::analyze_file(&request, &from)
                .map_err(|e| ui.diagnostic(&e, &input, None, false))?;
        }
    }
    if let Some(path) = accept {
        let source = fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))?;
        migration::apply_acceptances(&mut report, &source).map_err(|e| e.to_string())?;
    }
    let unresolved = report.findings.iter().filter(|f| !f.accepted).count();
    if json {
        let mut data = serde_json::to_value(&report).map_err(|e| e.to_string())?;
        data["fixed_files"] = changed.into();
        data["unresolved_findings"] = unresolved.into();
        println!(
            "{}",
            serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?
        );
    } else {
        let items = display::review_items(&report);
        if summary {
            let mut groups = std::collections::BTreeMap::<
                _,
                std::collections::BTreeMap<_, (usize, usize)>,
            >::new();
            for item in &items {
                let diagnostic = &item.findings[0].diagnostic;
                let counts = groups
                    .entry(diagnostic.filename.as_deref().unwrap_or(&input))
                    .or_default()
                    .entry(diagnostic.code.as_str())
                    .or_default();
                counts.0 += 1;
                counts.1 += item.findings.len();
            }
            for (filename, counts) in groups {
                ui.migration_group(filename, &counts);
            }
        } else if details {
            for finding in report.findings.iter().filter(|f| !f.accepted) {
                eprint!("{}", ui.diagnostic(&finding.diagnostic, &input, None, true));
                ui.migration_help(&finding.help, finding.fix.as_ref());
            }
        } else {
            for item in &items {
                ui.migration_item(item, &input);
            }
        }
        ui.migration_summary(MigrationSummary {
            files: report.files.len(),
            findings: report.findings.len(),
            accepted: report.findings.len() - unresolved,
            fixed: changed,
            complete: report.analysis_complete,
            review_items: items.len(),
            appearance_proposals: display::appearance_proposals(&items),
        });
    }
    // Review findings are an expected nonzero result, not a compiler failure.
    Ok(if report.analysis_complete && unresolved == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

pub(crate) fn replace(
    path: &Path,
    original: &str,
    replacement: &str,
    index: usize,
) -> Result<(), String> {
    if fs::read_to_string(path).map_err(|e| e.to_string())? != original {
        return Err(format!(
            "{} changed during migration; rerun the command",
            path.display()
        ));
    }
    let temporary = path.with_file_name(format!(
        ".europa-migrate-{}-{index}.tmp",
        std::process::id()
    ));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| format!("{}: {e}", temporary.display()))?;
    let result = (|| {
        file.set_permissions(fs::metadata(path)?.permissions())?;
        file.write_all(replacement.as_bytes())?;
        file.sync_all()?;
        // Check again immediately before replacement, retaining concurrent edits.
        if fs::read_to_string(path)? != original {
            return Err(std::io::Error::other(
                "Source changed while preparing migration",
            ));
        }
        fs::rename(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|e| format!("{}: {e}", path.display()))
}
