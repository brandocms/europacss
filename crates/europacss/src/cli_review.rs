//! Migration Studio operates only on the entry selected at server startup.
//! Plans contain fresh compiler proposals, never edits or paths supplied by the browser.
use crate::cli_migration::{display, replace};
use europacss::{
    migration::{self, Edit, Report},
    Request,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashSet},
    fs,
    path::{Path, PathBuf},
};

pub struct Session {
    entry: String,
    config: Option<String>,
    from: String,
    root: PathBuf,
    pending: Option<Plan>,
    revision: u64,
}
struct Plan {
    token: String,
    snapshot: String,
    files: Vec<Prepared>,
}
struct Prepared {
    filename: String,
    original: String,
    replacement: String,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Choice {
    Fix,
    Accept,
    Later,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Decision {
    id: usize,
    choice: Choice,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Selection {
    snapshot: String,
    decisions: Vec<Decision>,
}

impl Session {
    pub fn new(entry: String, config: Option<String>, from: String) -> Self {
        let root = config
            .as_deref()
            .map(Path::new)
            .and_then(Path::parent)
            .or_else(|| Path::new(&entry).parent())
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or(Path::new("."))
            .canonicalize()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
        Self {
            entry,
            config,
            from,
            root,
            pending: None,
            revision: 0,
        }
    }
    fn analyze(&self) -> Result<Report, String> {
        let config = match &self.config {
            Some(path) => europacss::load_config(Path::new(path))?,
            None => europacss::resolve_config(json!({})).map_err(|e| e.to_string())?,
        };
        migration::analyze_file(
            &Request {
                filename: self.entry.clone(),
                config,
                ..Request::default()
            },
            &self.from,
        )
        .map_err(|e| e.to_string())
    }
    fn name(&self, path: &str) -> String {
        // Keep the authored entry path for analysis so retargeted symlinks are
        // detected. Canonicalize it only for display alongside imported paths.
        let display = if path == self.entry {
            Path::new(path)
                .canonicalize()
                .unwrap_or_else(|_| path.into())
        } else {
            PathBuf::from(path)
        };
        pathdiff::diff_paths(display, &self.root)
            .unwrap_or_else(|| path.into())
            .to_string_lossy()
            .into_owned()
    }
    pub fn load(&mut self) -> Result<Value, String> {
        self.pending = None;
        let report = self.analyze()?;
        self.workspace(&report)
    }
    fn workspace(&self, report: &Report) -> Result<Value, String> {
        let groups = display::review_items(report);
        let items: Vec<_> = groups.iter().map(|group| {
            let first = &group.findings[0].diagnostic;
            let file = first.filename.as_deref().unwrap_or(&self.entry);
            let source = report.sources.get(file).map(String::as_str).unwrap_or("");
            let context = excerpt(source, first.line);
            let fixes: Vec<_> = group.fixes().iter().map(|fix| json!({
                "kind":fix.kind, "description":fix.description,
                "edits":fix.edits.iter().map(|edit| self.edit_view(edit, report)).collect::<Vec<_>>()
            })).collect();
            let comparisons: Vec<_> = display::order_sections(group).iter().map(|section| json!({
                "source": section.earlier_source,
                "path": self.name(section.earlier_source.filename.as_deref().unwrap_or(file)),
                "label": section.earlier_label, "reason":section.reason,
                "selectors":section.selector_path,"conditions":section.conditions,"values":section.values,
            })).collect();
            json!({ "id":group.indices[0], "indices":group.indices, "path":self.name(file),
                "line":first.line,"column":first.column,"code":first.code,"context":context,
                "fixes":fixes,"comparisons":comparisons,
                "fixable":group.findings.iter().filter(|f| f.fix.is_some()).count(),
                "can_fix":!fixes.is_empty() && (report.analysis_complete || group.fixes().iter().all(|f| f.kind == "syntax")),
                "can_accept":report.analysis_complete && group.findings.iter().all(|f| migration::can_accept(&f.diagnostic.code)),
            })
        }).collect();
        Ok(
            json!({ "entry":self.entry,"entry_label":self.name(&self.entry),
                "project": self.root.file_name().unwrap_or_default().to_string_lossy(),
                "config":self.config,"report":report,"items":items,
                "appearance_proposals":display::appearance_proposals(&groups),
            }),
        )
    }
    fn edit_view(&self, edit: &Edit, report: &Report) -> Value {
        let source = report
            .sources
            .get(&edit.filename)
            .map(String::as_str)
            .unwrap_or("");
        // Offsets refer to UTF-8 bytes, not JavaScript's UTF-16 string positions.
        let line = source
            .get(..edit.start)
            .unwrap_or("")
            .replace("\r\n", "\n")
            .replace(['\r', '\u{c}'], "\n")
            .bytes()
            .filter(|b| *b == b'\n')
            .count()
            + 1;
        let prefix = source.get(..edit.start).unwrap_or("");
        let indent = prefix.rsplit(['\n', '\r', '\u{c}']).next().unwrap_or("");
        let indent = if indent.chars().all(char::is_whitespace) {
            indent
        } else {
            ""
        };
        json!({"path":self.name(&edit.filename),"line":line,"before":format!("{indent}{}",edit.expected),"after":format!("{indent}{}",edit.replacement)})
    }
    fn selection(&self, bytes: &[u8]) -> Result<(Report, Selection), String> {
        let selection: Selection = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        let report = self.analyze()?;
        if selection.snapshot != report.snapshot {
            return Err("The CSS or configuration has changed. Refresh the analysis and review the updated source before continuing.".into());
        }
        let groups = display::review_items(&report);
        let mut seen = HashSet::new();
        for decision in &selection.decisions {
            if !seen.insert(decision.id) {
                return Err("Duplicate review decision".into());
            }
            let group = groups
                .iter()
                .find(|g| g.indices[0] == decision.id)
                .ok_or("Unknown review item")?;
            match decision.choice {
                Choice::Accept
                    if !report.analysis_complete
                        || group
                            .findings
                            .iter()
                            .any(|f| !migration::can_accept(&f.diagnostic.code)) =>
                {
                    return Err(
                        "This item cannot be accepted; resolve its syntax or analysis issue first."
                            .into(),
                    )
                }
                Choice::Fix => {
                    let fixes = group.fixes();
                    if fixes.is_empty() {
                        return Err("This item has no proposed edit; review it manually.".into());
                    }
                    if !report.analysis_complete && fixes.iter().any(|f| f.kind != "syntax") {
                        return Err(
                            "Complete the analysis before applying appearance edits.".into()
                        );
                    }
                }
                _ => {}
            }
        }
        Ok((report, selection))
    }
    pub fn export(&self, bytes: &[u8]) -> Result<Value, String> {
        let (report, selection) = self.selection(bytes)?;
        let mut result = serde_json::to_value(&report).map_err(|e| e.to_string())?;
        let groups = display::review_items(&report);
        for decision in &selection.decisions {
            let group = groups.iter().find(|g| g.indices[0] == decision.id).unwrap();
            for &index in &group.indices {
                match decision.choice {
                    Choice::Accept => result["findings"][index]["accepted"] = true.into(),
                    Choice::Fix
                        if report.findings[index]
                            .fix
                            .as_ref()
                            .is_some_and(|f| f.kind == "preserve-appearance") =>
                    {
                        result["findings"][index]["apply_fix"] = true.into()
                    }
                    _ => {}
                }
            }
        }
        result["studio_review"] = json!({"version":1,"decisions":selection.decisions});
        Ok(result)
    }
    pub fn prepare(&mut self, bytes: &[u8]) -> Result<Value, String> {
        self.pending = None;
        let (report, selection) = self.selection(bytes)?;
        let groups = display::review_items(&report);
        let mut edits = BTreeSet::new();
        let mut selected = Vec::new();
        for decision in &selection.decisions {
            if !matches!(decision.choice, Choice::Fix) {
                continue;
            }
            let group = groups.iter().find(|g| g.indices[0] == decision.id).unwrap();
            for fix in group.fixes() {
                for edit in &fix.edits {
                    if edits.insert((
                        &edit.filename,
                        edit.start,
                        edit.end,
                        &edit.expected,
                        &edit.replacement,
                    )) {
                        selected.push(edit.clone());
                    }
                }
            }
        }
        if selected.is_empty() {
            return Err("Choose at least one proposed edit first.".into());
        }
        let mut files = Vec::new();
        let mut views = Vec::new();
        for filename in &report.files {
            let mut edits: Vec<_> = selected
                .iter()
                .filter(|edit| &edit.filename == filename)
                .cloned()
                .collect();
            if edits.is_empty() {
                continue;
            }
            edits.sort_by_key(|edit| edit.start);
            let original = report
                .sources
                .get(filename)
                .ok_or("Missing analyzed source")?
                .clone();
            let replacement =
                migration::apply_edits(&original, filename, &edits).map_err(|e| e.to_string())?;
            views.push(json!({"path":self.name(filename),"edits":edits.iter().map(|edit| self.edit_view(edit, &report)).collect::<Vec<_>>()}));
            files.push(Prepared {
                filename: filename.clone(),
                original,
                replacement,
            });
        }
        self.revision += 1;
        let token = blake3::hash(
            format!(
                "{}:{}:{}",
                report.snapshot,
                self.revision,
                serde_json::to_string(&selection.decisions).unwrap()
            )
            .as_bytes(),
        )
        .to_hex()
        .to_string();
        let result = json!({"token":token,"files":views,"edit_count":selected.len()});
        self.pending = Some(Plan {
            token,
            snapshot: report.snapshot,
            files,
        });
        Ok(result)
    }
    pub fn apply(&mut self, bytes: &[u8]) -> Result<Value, String> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Commit {
            token: String,
        }
        let commit: Commit = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        let plan = self
            .pending
            .take()
            .ok_or("Review the selected edits before applying them.")?;
        if plan.token != commit.token {
            return Err(
                "This edit preview is no longer current. Review the selected edits again.".into(),
            );
        }
        let report = self.analyze()?;
        if report.snapshot != plan.snapshot {
            return Err("The CSS or configuration changed after the preview. Nothing was written. Refresh and review again.".into());
        }
        // Validate the whole batch before beginning. Individual replacements also
        // recheck contents and preserve permissions immediately before rename.
        for file in &plan.files {
            if fs::read_to_string(&file.filename).map_err(|e| e.to_string())? != file.original {
                return Err(
                    "Source changed after analysis. Nothing was written. Refresh and review again."
                        .into(),
                );
            }
        }
        for (index, file) in plan.files.iter().enumerate() {
            replace(Path::new(&file.filename), &file.original, &file.replacement, index)
                .map_err(|error| format!("{error}. {index} files were already updated; refresh the analysis before continuing."))?;
        }
        match self.load() {
            Ok(workspace) => Ok(json!({"written":plan.files.len(),"workspace":workspace})),
            Err(error) => Ok(json!({"written":plan.files.len(),"error":error})),
        }
    }
}

fn excerpt(source: &str, line: usize) -> Value {
    let normalized = source.replace("\r\n", "\n").replace(['\r', '\u{c}'], "\n");
    let start = line.saturating_sub(4);
    let lines: Vec<_> = normalized
        .lines()
        .enumerate()
        .skip(start)
        .take(8)
        .map(|(i, text)| json!({"number":i+1,"text":text,"focus":i+1==line}))
        .collect();
    json!(lines)
}
