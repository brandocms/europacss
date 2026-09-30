use crate::cli_migration::display::{order_sections, ReviewItem};
use europacss::{migration::Fix, Error};
use std::{
    env, fs,
    io::{self, IsTerminal},
    path::Path,
    time::Duration,
};
use unicode_width::UnicodeWidthStr;

#[derive(Clone, Copy, Default)]
pub enum Color {
    #[default]
    Auto,
    Always,
    Never,
}
impl Color {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "auto" => Ok(Self::Auto),
            "always" => Ok(Self::Always),
            "never" => Ok(Self::Never),
            _ => Err("--color expects auto, always, or never".into()),
        }
    }
    fn enabled(self, terminal: bool) -> bool {
        match self {
            Self::Always => true,
            Self::Never => false,
            Self::Auto => {
                terminal
                    && env::var_os("NO_COLOR").is_none_or(|value| value.is_empty())
                    && env::var("TERM").as_deref() != Ok("dumb")
            }
        }
    }
}

pub struct Build<'a> {
    pub input: &'a str,
    pub output: &'a str,
    pub bytes: usize,
    pub files: usize,
    pub map: bool,
    pub minify: bool,
    pub warnings: usize,
    pub elapsed: Duration,
}

pub struct MigrationSummary {
    pub files: usize,
    pub findings: usize,
    pub accepted: usize,
    pub fixed: usize,
    pub complete: bool,
    pub review_items: usize,
    pub appearance_proposals: usize,
}

pub struct Ui {
    color: bool,
    quiet: bool,
}
impl Ui {
    pub fn stderr(color: Color, quiet: bool) -> Self {
        Self {
            color: color.enabled(io::stderr().is_terminal()),
            quiet,
        }
    }
    pub fn stdout(color: Color) -> Self {
        Self {
            color: color.enabled(io::stdout().is_terminal()),
            quiet: false,
        }
    }
    fn paint(&self, code: &str, text: &str) -> String {
        if self.color {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.into()
        }
    }
    fn dim(&self, text: &str) -> String {
        self.paint("2", text)
    }
    pub fn help(&self) -> String {
        format!("\n  {} {}\n\n  {}\n    europa <input.css|-> [options]\n    europa migrate-config europa.config.cjs -o europa.json5\n    europa studio [--config europa.json5] [--port 0]\n    europa migrate <entry.css> --from 1.0.0-beta.16 [--check | --fix] [--json]\n\n  {}\n    -o, --output <file>    Write CSS to a file (default: stdout)\n    --config <file>        JSON5 or JSON configuration\n    --targets <query>      Browserslist targets (default: defaults)\n    --minify              Produce compact CSS\n    --watch               Rebuild on stylesheet/config changes (requires -o)\n    --source-map          Write an adjacent source map (requires -o)\n    --debug-tokens        Show font token labels in development CSS\n    --color <mode>        auto, always, or never (default: auto)\n    -q, --quiet            Hide success summaries\n    -h, --help             Show this help\n    -V, --version          Show the compiler version\n\n  {}\n    europa css/app.css --config europa.json5 -o public/app.css\n    europa css/app.css --minify --source-map -o public/app.min.css\n    cat app.css | europa - --minify > app.min.css\n\n  {}\n\n", self.paint("1;36", "europa"), self.dim(concat!(env!("CARGO_PKG_VERSION"), " · experimental Rust compiler")), self.paint("1", "Usage"), self.paint("1", "Options"), self.paint("1", "Examples"), self.dim("No Node runtime. Configuration is data; JavaScript is not executed."))
    }
    pub fn failure(&self, message: &str) -> String {
        format!("\n  {} {}\n", self.paint("1;31", "✗ error"), clean(message))
    }
    pub fn error(&self, message: &str) {
        if message.starts_with('\n') {
            eprint!("{message}");
        } else {
            eprintln!("{}", self.failure(message));
        }
    }
    pub fn watching(&self) {
        if !self.quiet {
            eprintln!(
                "\n  {}  {}\n          {}",
                self.paint("1;36", "europa"),
                self.paint("1;35", "◉ watching"),
                self.dim("Stylesheets + config · content checks every 250 ms · Ctrl-C to stop")
            );
        }
    }
    pub fn studio(&self, origin: &str) {
        eprintln!(
            "\n  {}  {}\n\n          {}\n          {}\n",
            self.paint("1;36", "europa"),
            self.paint("1;35", "◉ config studio"),
            self.paint("1", origin),
            self.dim("Open in your browser · edits stay in the browser · Ctrl-C to stop")
        );
    }
    pub fn diagnostic(
        &self,
        error: &Error,
        fallback_name: &str,
        source: Option<&str>,
        warning: bool,
    ) -> String {
        let name = error.filename.as_deref().unwrap_or(fallback_name);
        let tone = if warning { "1;33" } else { "1;31" };
        let label = if warning { "! warning" } else { "✗ error" };
        let path = display_path(name);
        let mut result = format!(
            "\n  {} {}\n  {}\n",
            self.paint(tone, &format!("{label} [{}]", clean(&error.code))),
            clean(&error.message),
            self.dim(&format!("→ {path}:{}:{}", error.line, error.column))
        );
        let loaded = if name == fallback_name {
            source
                .map(str::to_owned)
                .or_else(|| fs::read_to_string(name).ok())
        } else {
            fs::read_to_string(name).ok()
        };
        if let Some(source) = loaded {
            let normalized = source.replace("\r\n", "\n").replace(['\r', '\u{c}'], "\n");
            let lines: Vec<_> = normalized.split('\n').collect();
            if error.line > 0 && error.line <= lines.len() {
                let focus = error.line - 1;
                let end = (focus + 2).min(lines.len());
                let digits = end.to_string().len();
                result.push('\n');
                for (index, line) in lines
                    .iter()
                    .enumerate()
                    .take(end)
                    .skip(focus.saturating_sub(1))
                {
                    let column = if index == focus {
                        error.column.saturating_sub(1)
                    } else {
                        0
                    };
                    let (text, caret) = excerpt(line, column);
                    let gutter = format!("  {:>digits$} │", index + 1);
                    result.push_str(&format!("{} {text}\n", self.dim(&gutter)));
                    if index == focus {
                        result.push_str(&format!(
                            "{} {}{}\n",
                            self.dim(&format!("  {:digits$} │", "")),
                            " ".repeat(caret),
                            self.paint(tone, "^")
                        ));
                    }
                }
            }
        }
        if let Some(hint) = hint(&error.code) {
            result.push_str(&format!("\n  {} {}\n", self.paint("1;36", "help"), hint));
        }
        result
    }
    pub fn built(&self, build: Build<'_>) {
        let Build {
            input,
            output,
            bytes,
            files,
            map,
            minify,
            warnings,
            elapsed,
        } = build;
        if self.quiet {
            return;
        }
        let elapsed = if elapsed.as_secs_f64() >= 1.0 {
            format!("{:.2} s", elapsed.as_secs_f64())
        } else {
            format!("{:.1} ms", elapsed.as_secs_f64() * 1000.0)
        };
        let size = if bytes >= 1024 * 1024 {
            format!("{:.1} MiB", bytes as f64 / (1024.0 * 1024.0))
        } else if bytes >= 1024 {
            format!("{:.1} KiB", bytes as f64 / 1024.0)
        } else {
            format!("{bytes} B")
        };
        let mut details = vec![
            format!("{files} {}", if files == 1 { "file" } else { "files" }),
            size,
        ];
        if minify {
            details.push("minified".into());
        }
        if map {
            details.push("source map".into());
        }
        if warnings > 0 {
            details.push(format!(
                "{warnings} {}",
                if warnings == 1 { "warning" } else { "warnings" }
            ));
        }
        eprintln!(
            "\n  {}  {} {}\n          {} {} {}\n          {}\n",
            self.paint("1;36", "europa"),
            self.paint("1;32", "✓ compiled"),
            self.dim(&format!("in {elapsed}")),
            clean(input),
            self.dim("→"),
            self.paint("1", &clean(output)),
            self.dim(&details.join(" · "))
        );
    }
    pub fn migrated(&self, output: &str) {
        if !self.quiet {
            eprintln!(
                "\n  {} {}\n          {}\n",
                self.paint("1;32", "✓ config converted"),
                self.paint("1", &clean(output)),
                self.dim("Static configuration → JSON5 · no JavaScript executed")
            );
        }
    }
    pub fn migration_help(&self, help: &str, fix: Option<&Fix>) {
        eprintln!("  {} {}", self.paint("1;36", "help"), clean(help));
        if let Some(fix) = fix {
            self.migration_fix(fix);
        }
    }
    fn migration_fix(&self, fix: &Fix) {
        let action = if fix.kind == "syntax" {
            "--fix"
        } else {
            "--apply <review.json>"
        };
        eprintln!(
            "  {} {}",
            self.paint("1;32", action),
            clean(&fix.description)
        );
    }
    pub fn migration_item(&self, item: &ReviewItem<'_>, input: &str) {
        let first = item.findings[0];
        let mut diagnostic = first.diagnostic.clone();
        if diagnostic.code == "EU_MIGRATION_ORDER" && first.order.is_some() {
            diagnostic.message = format!(
                "Declaration order may change · {} {} at this source location",
                item.findings.len(),
                if item.findings.len() == 1 {
                    "comparison"
                } else {
                    "comparisons"
                }
            );
        } else if item.findings.len() > 1 {
            diagnostic.message = format!(
                "{} related findings at this source location",
                item.findings.len()
            );
        }
        eprint!("{}", self.diagnostic(&diagnostic, input, None, true));
        let mut earlier = None;
        for row in order_sections(item) {
            let key = (
                row.earlier_source,
                row.earlier_label,
                row.reason,
                row.selector_path,
            );
            if earlier != Some(key) {
                let source = row.earlier_source;
                let path = display_path(source.filename.as_deref().unwrap_or(input));
                eprintln!(
                    "  {} {} at {}:{}:{}",
                    self.paint("1;36", "earlier"),
                    clean(row.earlier_label),
                    path,
                    source.line,
                    source.column
                );
                eprintln!(
                    "    {}",
                    self.dim(&format!("{} the earlier value.", clean(row.reason)))
                );
                if !row.selector_path.is_empty() {
                    eprintln!(
                        "    {} {}",
                        self.dim("selector"),
                        clean(&row.selector_path.join(" → "))
                    );
                }
                earlier = Some(key);
            }
            for (old, new) in row.conditions {
                let scope = |conditions: &[String]| {
                    if conditions.is_empty() {
                        "unconditional".into()
                    } else {
                        clean(&conditions.join(" / "))
                    }
                };
                if old == new {
                    eprintln!("      {} {}", self.dim("within"), scope(old));
                } else {
                    eprintln!("      {} {}", self.dim("earlier when"), scope(old));
                    eprintln!("      {} {}", self.dim("later when"), scope(new));
                }
            }
            for (old, new) in row.values {
                eprintln!(
                    "        {} {} {}",
                    clean(old),
                    self.paint("1;33", "→"),
                    self.paint("1", &clean(new))
                );
            }
        }
        // Other categories retain every distinct message under one excerpt.
        if item.findings.len() > 1 {
            for finding in item.findings.iter().filter(|f| f.order.is_none()) {
                eprintln!("    • {}", clean(&finding.diagnostic.message));
            }
        }
        let mut helps = std::collections::HashSet::new();
        for finding in &item.findings {
            if helps.insert(finding.help.as_str()) {
                self.migration_help(&finding.help, None);
            }
        }
        let fixes = item.fixes();
        if first.diagnostic.code == "EU_MIGRATION_ORDER" && fixes.is_empty() {
            eprintln!(
                "  {}",
                self.dim("Manual review · no automatic edit proposal for this item")
            );
        }
        for fix in fixes {
            self.migration_fix(fix);
        }
    }
    pub fn migration_group(
        &self,
        filename: &str,
        counts: &std::collections::BTreeMap<&str, (usize, usize)>,
    ) {
        eprintln!("\n  {}", self.paint("1;36", &display_path(filename)));
        for (code, (items, findings)) in counts {
            eprintln!(
                "    {}  {} {}",
                self.paint(
                    "1;33",
                    &format!("{items:>5} {}", if *items == 1 { "item" } else { "items" })
                ),
                clean(code),
                self.dim(&format!(
                    "({findings} {})",
                    if *findings == 1 {
                        "finding"
                    } else {
                        "findings"
                    }
                ))
            );
        }
    }
    pub fn migration_summary(&self, summary: MigrationSummary) {
        let MigrationSummary {
            files,
            findings,
            accepted,
            fixed,
            complete,
            review_items,
            appearance_proposals,
        } = summary;
        let unresolved = findings - accepted;
        if self.quiet && unresolved == 0 && complete {
            return;
        }
        let label = if unresolved == 0 && complete {
            "✓ no unresolved findings in the checks performed"
        } else {
            "! migration review required"
        };
        eprintln!("\n  {}  {}\n          {} · {}\n          {unresolved} unresolved · {accepted} accepted · {} fixed\n          {}\n", self.paint("1;36", "europa"), self.paint(if unresolved == 0 && complete { "1;32" } else { "1;33" }, label), counted(files, "file", "files"), counted(review_items, "review item", "review items"), counted(fixed, "file", "files"), self.dim("Nesting, syntax, order, and selected sizing corrections; rendered-page comparison remains necessary."));
        if appearance_proposals > 0 {
            eprintln!("  {} {}\n", self.paint("1;32", &counted(appearance_proposals, "distinct appearance edit proposal", "distinct appearance edit proposals")), self.dim("· export --json, review apply_fix:true choices, then use --apply <review.json>"));
        }
        if !complete {
            eprintln!("  {}\n", self.paint("1;31", "Analysis incomplete — resolve the analysis diagnostics before accepting this report."));
        }
    }
}

fn counted(count: usize, singular: &str, plural: &str) -> String {
    format!("{count} {}", if count == 1 { singular } else { plural })
}

fn display_path(name: &str) -> String {
    let path = Path::new(name);
    let relative = env::current_dir()
        .ok()
        .and_then(|cwd| path.strip_prefix(cwd).ok().map(Path::to_path_buf));
    clean(&relative.as_deref().unwrap_or(path).to_string_lossy())
}
fn clean(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_control() && c != '\n' && c != '\t' {
                '�'
            } else {
                c
            }
        })
        .collect()
}
fn hint(code: &str) -> Option<&'static str> {
    match code {
        "EU_LEGACY_SUFFIX" => Some(
            "Use an explicit selector, such as .card__title, at the same nesting level as .card.",
        ),
        "EU_LEGACY_NEST" => Some("Replace @nest with a native nested selector containing &."),
        "EU_IMPORT" => {
            Some("Use an exact path relative to the importing file, including its extension.")
        }
        "EU_IMPORT_CYCLE" => {
            Some("Move shared rules into a stylesheet that does not import either caller.")
        }
        "EU_BREAKPOINT" => {
            Some("Check theme.breakpoints and theme.breakpointCollections in your config.")
        }
        "EU_RESPONSIVE" => Some(
            "Inside @responsive, omit the directive's query or use a nested @responsive block.",
        ),
        _ => None,
    }
}

// Diagnostic columns count UTF-16 code units; terminals count display cells.
// Expand tabs before cropping, keeping a bounded excerpt around the actual caret.
fn excerpt(line: &str, column: usize) -> (String, usize) {
    let mut expanded = String::new();
    let mut units = 0;
    let mut byte_caret = None;
    for c in line.chars() {
        if units >= column && byte_caret.is_none() {
            byte_caret = Some(expanded.len());
        }
        if c == '\t' {
            expanded.push_str(&" ".repeat(4 - expanded.width() % 4));
        } else {
            expanded.push(if c.is_control() { '�' } else { c });
        }
        units += c.len_utf16();
    }
    let caret = byte_caret.unwrap_or(expanded.len());
    let before = expanded[..caret].chars().count();
    let start = before.saturating_sub(60);
    let end = (start + 120).max(before + 1);
    let chars: Vec<_> = expanded.chars().collect();
    let body: String = chars.iter().skip(start).take(end - start).collect();
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < chars.len() { "…" } else { "" };
    let before: String = chars[start..before].iter().collect();
    (
        format!("{prefix}{body}{suffix}"),
        prefix.width() + before.width(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn caret_uses_display_width_after_tabs_wide_and_combining_characters() {
        assert_eq!(
            excerpt("\t界🙂e\u{301} bad", 7),
            ("    界🙂e\u{301} bad".into(), 10)
        );
        let (text, caret) = excerpt(&format!("{}broken", "x".repeat(300)), 300);
        assert!(text.starts_with('…'));
        assert!(text.ends_with("broken"));
        assert_eq!(caret, 61);
    }
}
