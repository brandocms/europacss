//! Options for styles embedded by a host, such as CSS written for one CMS
//! module: confine the rules to a scope selector and limit which hosts URLs may
//! name. Both check the authored source, so errors keep the author's locations.
use crate::parser::{self, Node};
use crate::Error;
use serde::Deserialize;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmbedOptions {
    /// Compile the source as the body of this selector. Every rule must select
    /// the scope element or its descendants, and page-wide at-rules are errors.
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub external_urls: ExternalUrls,
}

/// Which absolute URLs `url()`, `image-set()` and `@import` may name. Relative,
/// root-relative, fragment and `data:` URLs are always allowed.
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(try_from = "RawExternalUrls")]
pub enum ExternalUrls {
    #[default]
    Allow,
    Deny,
    /// Exact host names, without scheme or port.
    Hosts(Vec<String>),
}

#[derive(Deserialize)]
#[serde(untagged)]
enum RawExternalUrls {
    Mode(String),
    Hosts(Vec<String>),
}

impl TryFrom<RawExternalUrls> for ExternalUrls {
    type Error = String;
    fn try_from(raw: RawExternalUrls) -> Result<Self, String> {
        match raw {
            RawExternalUrls::Mode(mode) => Self::parse(&mode),
            RawExternalUrls::Hosts(hosts) => Self::hosts(hosts),
        }
    }
}

impl ExternalUrls {
    /// `allow`, `deny`, or a comma-separated host list, as the CLI takes it.
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim() {
            "allow" => Ok(Self::Allow),
            "deny" => Ok(Self::Deny),
            hosts => Self::hosts(hosts.split(',').map(str::to_owned).collect()),
        }
    }

    fn hosts(hosts: Vec<String>) -> Result<Self, String> {
        let hosts = hosts
            .iter()
            .map(|host| {
                let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
                if host.is_empty()
                    || host
                        .chars()
                        .any(|c| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')))
                {
                    Err(format!(
                        "externalUrls takes \"allow\", \"deny\" or host names such as cdn.example.com, not `{}`",
                        host.trim()
                    ))
                } else {
                    Ok(host)
                }
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self::Hosts(hosts))
    }
}

/// Check the authored nodes, then wrap them in the scope selector.
pub(crate) fn apply(nodes: Vec<Node>, options: &EmbedOptions) -> Result<Vec<Node>, Error> {
    if options.external_urls != ExternalUrls::Allow {
        urls(&nodes, &options.external_urls)?;
    }
    let Some(scope) = &options.scope else {
        return Ok(nodes);
    };
    let scope = scope_selector(scope)?;
    // Placeholders must stay at the root; @extend still uses them inside the scope.
    let (placeholders, body): (Vec<_>, Vec<_>) = nodes
        .into_iter()
        .partition(|node| node.text.starts_with('%'));
    for placeholder in &placeholders {
        if let Some(children) = &placeholder.children {
            scoped(children, true)?;
        }
    }
    scoped(&body, true)?;
    let mut result = placeholders;
    result.push(Node::block(scope, body, 0));
    Ok(result)
}

fn scope_error(offset: usize, message: impl Into<String>) -> Error {
    Error::new("EU_SCOPE", message, offset)
}

fn scope_selector(scope: &str) -> Result<String, Error> {
    let scope = scope.trim();
    let invalid = || scope_error(0, format!("Invalid scope selector `{scope}`"));
    if scope.is_empty() || scope.starts_with(['%', '@']) {
        return Err(invalid());
    }
    let nodes = parser::parse(&format!("{scope} {{}}")).map_err(|_| invalid())?;
    let single = matches!(nodes.as_slice(), [node] if node.text == scope && node.children.as_ref().is_some_and(Vec::is_empty));
    if !single || !parser::nesting_offsets(scope)?.is_empty() {
        return Err(invalid());
    }
    Ok(scope.to_owned())
}

/// Blocks whose rules stay in the enclosing selector's scope.
const SCOPED_BLOCKS: &[&str] = &[
    "media",
    "supports",
    "container",
    "layer",
    "starting-style",
    "responsive",
    "mq",
    "if",
    "iterate",
];

/// Europa directives that expand to declarations of the enclosing rule.
const SCOPED_STATEMENTS: &[&str] = &[
    "color",
    "color!",
    "display",
    "order",
    "font",
    "fontsize",
    "space",
    "space!",
    "column-offset",
    "abs100",
    "abs100!",
    "embed-responsive",
    "grid",
    "column",
    "unpack",
    "extend",
];

/// `parent_is_scope`: the enclosing rule can select the scope element itself.
fn scoped(nodes: &[Node], parent_is_scope: bool) -> Result<(), Error> {
    for node in nodes {
        if let Some((name, _)) = node.at_rule() {
            let lower = name.to_ascii_lowercase();
            let allowed = match node.children {
                Some(_) => SCOPED_BLOCKS.contains(&lower.as_str()),
                None => SCOPED_STATEMENTS.contains(&lower.as_str()),
            };
            if !allowed {
                return Err(scope_error(
                    node.offset,
                    format!("@{name} is not allowed in scoped styles. They may use Europa directives, and @media, @supports, @container, @layer and @starting-style blocks"),
                ));
            }
            if let Some(children) = &node.children {
                scoped(children, parent_is_scope)?;
            }
            continue;
        }
        let Some(children) = &node.children else {
            continue;
        };
        let mut is_scope = false;
        for selector in parser::split_top_level(&node.text, ',')
            .map_err(|e| scope_error(node.offset, e.message))?
        {
            is_scope |= selector_is_scope(selector, parent_is_scope)
                .map_err(|message| scope_error(node.offset, message))?;
        }
        scoped(children, is_scope)?;
    }
    Ok(())
}

/// Whether a nested selector can select the scope element itself, or an error
/// when it can select elements outside the scope.
fn selector_is_scope(selector: &str, parent_is_scope: bool) -> Result<bool, String> {
    let shape = parser::selector_shape(selector).map_err(|e| e.message)?;
    if shape.nested_ampersand {
        return Err(format!("`{selector}` puts `&` inside a selector function such as :not(), :is() or :has(), which can select elements outside the scope"));
    }
    let after_parent = match shape
        .compounds
        .iter()
        .rposition(|(_, ampersand)| *ampersand)
    {
        // Without `&`, the selector is relative to the parent: a descendant
        // unless it starts with a combinator.
        None => Some(shape.compounds.first().and_then(|(c, _)| *c).unwrap_or(' ')),
        Some(last) => shape.compounds.get(last + 1).map(|(c, _)| c.unwrap_or(' ')),
    };
    match after_parent {
        None => Ok(parent_is_scope),
        Some('~' | '+') if parent_is_scope => Err(format!(
            "`{selector}` selects siblings of the scope element, outside the scope"
        )),
        Some(_) => Ok(false),
    }
}

fn urls(nodes: &[Node], policy: &ExternalUrls) -> Result<(), Error> {
    for node in nodes {
        if let Some(children) = &node.children {
            // Block preludes such as @supports conditions fetch nothing.
            urls(children, policy)?;
            continue;
        }
        if node.text.starts_with("/*") {
            continue;
        }
        let check = |raw: &str, url: &str| {
            allowed(url, policy).map_err(|message| {
                Error::new(
                    "EU_EXTERNAL_URL",
                    message,
                    node.offset + node.text.find(raw).unwrap_or(0),
                )
            })
        };
        if let Some((name, params)) = node.at_rule() {
            if name.eq_ignore_ascii_case("import") {
                let url = crate::imports::import_url(params, node.offset)?;
                if *policy == ExternalUrls::Deny || url.to_ascii_lowercase().starts_with("data:") {
                    return Err(Error::new(
                        "EU_EXTERNAL_URL",
                        "@import is not allowed when externalUrls limits URLs",
                        node.offset,
                    ));
                }
                check(params, &url)?;
            }
            continue;
        }
        let mut found = Vec::new();
        parser::rewrite_urls(&node.text, &mut |raw| {
            found.push(raw.to_owned());
            Ok(raw.to_owned())
        })
        .map_err(|e| Error::new(&e.code, e.message, node.offset))?;
        // src() and image() take URL strings too.
        parser::rewrite_value(&node.text, &mut |name, args| {
            if let Some(args) = args.filter(|_| {
                ["src", "image", "-webkit-image"]
                    .iter()
                    .any(|f| name.eq_ignore_ascii_case(f))
            }) {
                for item in parser::split_top_level(args, ',')? {
                    if item.starts_with(['\'', '"']) {
                        let end = parser::components(item)?.first().map_or(0, |c| c.len());
                        found.push(item[..end].to_owned());
                    }
                }
            }
            Ok(None)
        })
        .map_err(|e| Error::new(&e.code, e.message, node.offset))?;
        for raw in found {
            check(&raw, &parser::decode_string(&raw, node.offset)?)?;
        }
    }
    Ok(())
}

/// Classify a URL as the browser's URL parser would read it, so escapes,
/// backslashes and stray whitespace cannot hide a host.
fn allowed(url: &str, policy: &ExternalUrls) -> Result<(), String> {
    let url: String = url
        .trim_matches(|c: char| c <= ' ')
        .chars()
        .filter(|c| !matches!(c, '\t' | '\n' | '\r'))
        .map(|c| if c == '\\' { '/' } else { c })
        .collect();
    let host = if let Some(rest) = url.strip_prefix("//") {
        host(rest)
    } else {
        let scheme = url.find(':').map(|colon| &url[..colon]).filter(|scheme| {
            scheme.starts_with(|c: char| c.is_ascii_alphabetic())
                && scheme
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        });
        match scheme.map(str::to_ascii_lowercase).as_deref() {
            None => return Ok(()),
            Some("data") => return Ok(()),
            Some("http" | "https" | "ws" | "wss" | "ftp") => {
                host(url[url.find(':').unwrap() + 1..].trim_start_matches('/'))
            }
            Some(scheme) => return Err(format!("`{scheme}:` URLs are not allowed")),
        }
    };
    match policy {
        ExternalUrls::Hosts(hosts) if hosts.contains(&host) => Ok(()),
        ExternalUrls::Hosts(hosts) => Err(format!(
            "`{url}` names a host that is not allowed. Allowed hosts: {}",
            hosts.join(", ")
        )),
        _ => Err(format!(
            "`{url}` is an external URL, and externalUrls denies them"
        )),
    }
}

fn host(authority: &str) -> String {
    let end = authority.find(['/', '?', '#']).unwrap_or(authority.len());
    let authority = &authority[..end];
    let authority = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);
    let host = if authority.starts_with('[') {
        authority.split_inclusive(']').next().unwrap_or(authority)
    } else {
        authority.split(':').next().unwrap_or(authority)
    };
    host.trim_end_matches('.').to_ascii_lowercase()
}
