//! Local CSS imports. Contents expand at the import site; source text stays unmodified.
use crate::{
    parser::{self, Node},
    sources::Sources,
    watch::Snapshot,
    Error,
};
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
};

pub(crate) struct Loaded {
    pub nodes: Vec<Node>,
    pub sources: Sources,
    pub output_dir: PathBuf,
    pub watch: Vec<Snapshot>,
}

pub(crate) fn load(entry: &Path, output: Option<&Path>) -> Result<Loaded, Error> {
    load_tracked(entry, output, None, &mut Vec::new())
}

pub(crate) fn load_tracked(
    entry: &Path,
    output: Option<&Path>,
    source: Option<&str>,
    watched: &mut Vec<PathBuf>,
) -> Result<Loaded, Error> {
    watched.push(entry.to_path_buf());
    let entry_path = entry.to_path_buf();
    let entry = fs::canonicalize(entry)
        .map_err(|e| Error::new("EU_IMPORT", format!("{}: {e}", entry.display()), 0))?;
    let output_dir = match output {
        Some(path) => fs::canonicalize(
            path.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )
        .map_err(|e| Error::new("EU_OUTPUT", format!("Output directory: {e}"), 0))?,
        None => entry.parent().unwrap().to_path_buf(),
    };
    let mut loader = Loader {
        watched,
        entry_source: source.map(|source| (entry.clone(), source.to_string())),
        sources: Sources::default(),
        cache: HashMap::new(),
        stack: Vec::new(),
        nodes: 0,
        aliases: BTreeSet::from([(entry_path, entry.clone())]),
    };
    let nodes = loader
        .file(&entry, 0)
        .map_err(|error| loader.sources.locate(error))?;
    validate_external_order(&nodes).map_err(|error| loader.sources.locate(error))?;
    let snapshots: HashMap<_, _> = loader
        .sources
        .files
        .iter()
        .enumerate()
        .map(|(index, file)| {
            (
                PathBuf::from(&file.name),
                Snapshot::from_source(
                    PathBuf::from(&file.name),
                    loader.sources.content(index).as_bytes(),
                ),
            )
        })
        .collect();
    // Include canonical dependencies as well as every authored alias. Changing an
    // imported symlink must rebuild even when the former target stays unchanged.
    let mut watch: Vec<_> = loader
        .sources
        .files
        .iter()
        .map(|f| snapshots[Path::new(&f.name)].clone())
        .collect();
    for (path, target) in loader.aliases {
        if path != target {
            watch.push(snapshots[&target].clone().at_path(path));
        }
    }
    Ok(Loaded {
        nodes,
        sources: loader.sources,
        output_dir,
        watch,
    })
}

struct Loader<'a> {
    watched: &'a mut Vec<PathBuf>,
    entry_source: Option<(PathBuf, String)>,
    sources: Sources,
    cache: HashMap<PathBuf, Vec<Node>>,
    stack: Vec<PathBuf>,
    nodes: usize,
    aliases: BTreeSet<(PathBuf, PathBuf)>,
}
impl Loader<'_> {
    fn file(&mut self, path: &Path, origin: usize) -> Result<Vec<Node>, Error> {
        self.watched.push(path.to_path_buf());
        if self.stack.iter().any(|item| item == path) {
            let chain = self
                .stack
                .iter()
                .chain(std::iter::once(&path.to_path_buf()))
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(" -> ");
            return Err(Error::new(
                "EU_IMPORT_CYCLE",
                format!("Import cycle: {chain}"),
                origin,
            ));
        }
        if self.stack.len() >= 64 {
            return Err(Error::new(
                "EU_LIMIT",
                "Maximum import depth exceeded",
                origin,
            ));
        }
        let nodes = if let Some(nodes) = self.cache.get(path) {
            nodes.clone()
        } else {
            let source = match &self.entry_source {
                Some((entry, source)) if entry == path => source.clone(),
                _ => fs::read_to_string(path).map_err(|e| {
                    Error::new("EU_IMPORT", format!("{}: {e}", path.display()), origin)
                })?,
            };
            if self.sources.text.len() + source.len() > 16 * 1024 * 1024 {
                return Err(Error::new(
                    "EU_LIMIT",
                    "Imported source exceeds 16 MiB",
                    origin,
                ));
            }
            let start = self
                .sources
                .add(path.to_string_lossy().into_owned(), &source);
            let mut nodes = parser::parse(&source).map_err(|mut error| {
                error.offset += start;
                error
            })?;
            fn shift(nodes: &mut [Node], start: usize) {
                for node in nodes {
                    node.offset += start;
                    if let Some(children) = &mut node.children {
                        shift(children, start);
                    }
                }
            }
            shift(&mut nodes, start);
            self.cache.insert(path.to_path_buf(), nodes.clone());
            nodes
        };
        self.stack.push(path.to_path_buf());
        let result = self.expand(nodes, path, true);
        self.stack.pop();
        result
    }

    fn expand(&mut self, nodes: Vec<Node>, path: &Path, root: bool) -> Result<Vec<Node>, Error> {
        let mut result = Vec::new();
        let mut imports_allowed = root;
        for mut node in nodes {
            self.nodes += 1;
            if self.nodes > 100_000 {
                return Err(Error::new(
                    "EU_LIMIT",
                    "Import expansion exceeds 100000 nodes",
                    node.offset,
                ));
            }
            let rule = node.at_rule();
            if let Some((name, params)) = rule {
                if name.eq_ignore_ascii_case("charset") {
                    if !root
                        || node.children.is_some()
                        || !parser::decode_string(params, node.offset)?
                            .eq_ignore_ascii_case("utf-8")
                    {
                        return Err(Error::new(
                            "EU_IMPORT",
                            "Only root UTF-8 @charset declarations are supported",
                            node.offset,
                        ));
                    }
                    continue;
                }
                if name.eq_ignore_ascii_case("namespace") {
                    return Err(Error::new("EU_IMPORT_NAMESPACE", "File bundling does not yet support stylesheet-local @namespace declarations", node.offset));
                }
                if name.eq_ignore_ascii_case("import") {
                    if !imports_allowed || node.children.is_some() {
                        return Err(Error::new(
                            "EU_IMPORT_ORDER",
                            "@import must be a root statement before style rules",
                            node.offset,
                        ));
                    }
                    let import = Import::parse(params, node.offset)?;
                    if external(&import.url) {
                        result.push(node);
                        continue;
                    }
                    let filename = import.url.split(['?', '#']).next().unwrap();
                    if filename.is_empty() {
                        return Err(Error::new(
                            "EU_IMPORT",
                            "Empty local import path",
                            node.offset,
                        ));
                    }
                    let filename = percent_decode(filename, node.offset)?;
                    let logical_path = path.parent().unwrap().join(filename);
                    self.watched.push(logical_path.clone());
                    let resolved = fs::canonicalize(&logical_path).map_err(|e| {
                        Error::new(
                            "EU_IMPORT",
                            format!("Cannot import {}: {e}", logical_path.display()),
                            node.offset,
                        )
                    })?;
                    self.aliases.insert((logical_path, resolved.clone()));
                    let mut children = self.file(&resolved, node.offset)?;
                    if !import.wrappers.is_empty() && contains_import(&children) {
                        return Err(Error::new("EU_IMPORT_ORDER", "A conditional or layered local import cannot contain external @imports; move external imports to the entry stylesheet", node.offset));
                    }
                    for wrapper in import.wrappers {
                        children = vec![Node::block(wrapper, children, node.offset)];
                    }
                    result.extend(children);
                    continue;
                }
            }
            if !node.text.starts_with("/*")
                && !rule.is_some_and(|(name, _)| {
                    name.eq_ignore_ascii_case("layer") && node.children.is_none()
                })
            {
                imports_allowed = false;
            }
            if let Some(children) = node.children.take() {
                node.children = Some(self.expand(children, path, false)?);
            }
            result.push(node);
        }
        Ok(result)
    }
}

struct Import {
    url: String,
    wrappers: Vec<String>,
}
impl Import {
    fn parse(params: &str, offset: usize) -> Result<Self, Error> {
        let args =
            parser::components(params).map_err(|e| Error::new("EU_IMPORT", e.message, offset))?;
        let Some(first) = args.first() else {
            return Err(Error::new(
                "EU_IMPORT",
                "@import requires a quoted path or url()",
                offset,
            ));
        };
        let url = if first.starts_with(['\'', '"']) {
            parser::decode_string(first, offset)?
        } else if let Some(value) = function(first, "url") {
            parser::decode_string(value, offset)?
        } else {
            return Err(Error::new(
                "EU_IMPORT",
                "@import requires a quoted path or url()",
                offset,
            ));
        };
        if url.is_empty() {
            return Err(Error::new("EU_IMPORT", "Empty import URL", offset));
        }
        let mut at = 1;
        let mut wrappers = Vec::new();
        if let Some(layer) = args.get(at) {
            if keyword(layer, "layer") {
                wrappers.push("@layer".into());
                at += 1;
            } else if let Some(name) = function(layer, "layer") {
                let name = name.trim();
                if name.is_empty() {
                    return Err(Error::new(
                        "EU_IMPORT",
                        "layer() needs a layer name",
                        offset,
                    ));
                }
                wrappers.push(format!("@layer {name}"));
                at += 1;
            }
        }
        if let Some(supports) = args.get(at) {
            if let Some(condition) = function(supports, "supports") {
                let condition = condition.trim();
                if condition.is_empty() {
                    return Err(Error::new(
                        "EU_IMPORT",
                        "supports() needs a condition",
                        offset,
                    ));
                }
                let condition = if parser::split_top_level(condition, ':')?.len() > 1 {
                    format!("({condition})")
                } else {
                    condition.into()
                };
                wrappers.push(format!("@supports {condition}"));
                at += 1;
            }
        }
        if at < args.len() {
            wrappers.push(format!("@media {}", args[at..].join(" ")));
        }
        Ok(Self { url, wrappers })
    }
}

fn keyword(value: &str, expected: &str) -> bool {
    parser::decode_string(value, 0).is_ok_and(|name| name.eq_ignore_ascii_case(expected))
}

fn function<'a>(value: &'a str, expected: &str) -> Option<&'a str> {
    let (name, rest) = value.split_once('(')?;
    keyword(name, expected)
        .then(|| rest.strip_suffix(')'))
        .flatten()
}

pub(crate) fn external_import(params: &str, offset: usize) -> Result<bool, Error> {
    Ok(external(&Import::parse(params, offset)?.url))
}
fn external(url: &str) -> bool {
    url.starts_with(['/', '#'])
        || url.find(':').is_some_and(|colon| {
            let scheme = &url[..colon];
            scheme.starts_with(|c: char| c.is_ascii_alphabetic())
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        })
}
fn contains_import(nodes: &[Node]) -> bool {
    nodes.iter().any(|node| {
        node.at_rule()
            .is_some_and(|(name, _)| name.eq_ignore_ascii_case("import"))
            || node
                .children
                .as_ref()
                .is_some_and(|children| contains_import(children))
    })
}
pub(crate) fn validate_external_order(nodes: &[Node]) -> Result<(), Error> {
    let mut allowed = true;
    for node in nodes {
        if node.text.starts_with("/*") {
            continue;
        }
        match node.at_rule() {
            Some((name, params)) if name.eq_ignore_ascii_case("import") => {
                if !allowed || node.children.is_some() {
                    return Err(Error::new("EU_IMPORT_ORDER", "External @import would follow bundled style rules; move it before local imports", node.offset));
                }
                if !external_import(params, node.offset)? {
                    return Err(Error::new(
                        "EU_IMPORT",
                        "Local @imports require compile_file or a file input to the CLI",
                        node.offset,
                    ));
                }
            }
            Some((name, _))
                if name.eq_ignore_ascii_case("charset")
                    || name.eq_ignore_ascii_case("layer") && node.children.is_none() => {}
            _ => {
                allowed = false;
            }
        }
    }
    Ok(())
}

/// Rebase after expansion so URLs introduced by config tokens use the directive's origin too.
pub(crate) fn rebase(
    nodes: &mut [Node],
    sources: &Sources,
    output_dir: &Path,
) -> Result<(), Error> {
    for node in nodes {
        let file = &sources.files[sources.index(node.offset)];
        let parent = Path::new(&file.name).parent().unwrap();
        let offset = node.offset;
        node.text = parser::rewrite_urls(&node.text, &mut |raw| {
            let url = parser::decode_string(raw, offset)?;
            if url.is_empty() || external(&url) {
                return Ok(raw.into());
            }
            let end = url.find(['?', '#']).unwrap_or(url.len());
            let path = parent.join(percent_decode(&url[..end], offset)?);
            let relative = pathdiff::diff_paths(path, output_dir).ok_or_else(|| {
                Error::new(
                    "EU_URL",
                    "Cannot make asset path relative to output",
                    offset,
                )
            })?;
            let value = format!(
                "{}{}",
                encode_path(&relative.to_string_lossy()),
                &url[end..]
            );
            Ok(quote(&value))
        })
        .map_err(|e| Error::new(&e.code, e.message, offset))?;
        if let Some(children) = &mut node.children {
            rebase(children, sources, output_dir)?;
        }
    }
    Ok(())
}

fn quote(value: &str) -> String {
    let mut result = String::from("\"");
    for c in value.chars() {
        match c {
            '\\' | '"' => {
                result.push('\\');
                result.push(c);
            }
            '\n' => result.push_str("\\a "),
            '\r' => result.push_str("\\d "),
            '\u{c}' => result.push_str("\\c "),
            _ => result.push(c),
        }
    }
    result.push('"');
    result
}
fn percent_decode(value: &str, offset: usize) -> Result<String, Error> {
    let bytes = value.as_bytes();
    let mut result = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%'
            && at + 2 < bytes.len()
            && bytes[at + 1].is_ascii_hexdigit()
            && bytes[at + 2].is_ascii_hexdigit()
        {
            result.push(u8::from_str_radix(&value[at + 1..at + 3], 16).unwrap());
            at += 3;
        } else {
            result.push(bytes[at]);
            at += 1;
        }
    }
    String::from_utf8(result)
        .map_err(|_| Error::new("EU_URL", "Local URL must decode to UTF-8", offset))
}
fn encode_path(value: &str) -> String {
    value
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('#', "%23")
        .replace('?', "%3F")
        .replace('\n', "%0A")
        .replace('\r', "%0D")
}
