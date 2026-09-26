//! Europa's structural parser. CSS selectors and property grammars belong to the backend.
//! All offsets are UTF-8 byte offsets into the unmodified source.
use crate::Error;

#[derive(Clone, Debug, PartialEq)]
pub struct Node {
    pub text: String,
    pub children: Option<Vec<Node>>,
    pub offset: usize,
}

impl Node {
    pub fn leaf(text: impl Into<String>, offset: usize) -> Self {
        Self {
            text: text.into(),
            children: None,
            offset,
        }
    }
    pub fn block(text: impl Into<String>, children: Vec<Node>, offset: usize) -> Self {
        Self {
            text: text.into(),
            children: Some(children),
            offset,
        }
    }
    pub fn at_rule(&self) -> Option<(&str, &str)> {
        let rest = self.text.strip_prefix('@')?;
        let end = rest
            .find(|c: char| !(c.is_alphanumeric() || c == '-' || c == '!' || c == '_'))
            .unwrap_or(rest.len());
        Some((&rest[..end], rest[end..].trim()))
    }
}

pub fn parse(source: &str) -> Result<Vec<Node>, Error> {
    Scanner { source, pos: 0 }.nodes(false, 0)
}

pub fn arguments(source: &str) -> Result<Vec<&str>, Error> {
    let mut scanner = Scanner { source, pos: 0 };
    let mut start = None;
    let mut args = Vec::new();
    while let Some(c) = scanner.byte() {
        let before = scanner.pos;
        if space(c) || scanner.rest().starts_with("/*") {
            if let Some(start) = start.take() {
                args.push(&source[start..before]);
            }
            if !scanner.opaque(0)? {
                scanner.pos += 1;
            }
        } else {
            start.get_or_insert(before);
            if !scanner.opaque(0)? {
                if matches!(c, b'{' | b'}' | b';' | b')' | b']') {
                    return Err(scanner.error("Unexpected delimiter in directive arguments"));
                }
                scanner.advance();
            }
        }
    }
    if let Some(start) = start {
        args.push(&source[start..]);
    }
    Ok(args)
}

/// Expand iteration placeholders without editing comments, escapes, or longer names.
/// Strings are intentional interpolation sites (e.g. content: '$key').
pub fn interpolate(source: &str, key: &str, value: Option<&str>) -> Result<String, Error> {
    let mut scanner = Scanner { source, pos: 0 };
    let mut result = String::new();
    let mut quote = None;
    while let Some(c) = scanner.byte() {
        let start = scanner.pos;
        if c == b'\\' || quote.is_none() && scanner.rest().starts_with("/*") {
            scanner.opaque(0)?;
        } else if matches!(c, b'\'' | b'"') && (quote.is_none() || quote == Some(c)) {
            quote = if quote.is_some() { None } else { Some(c) };
            scanner.pos += 1;
        } else if let Some(name) = ["$key", "$value"].into_iter().find(|name| {
            scanner
                .rest()
                .strip_prefix(name)
                .is_some_and(|rest| !rest.starts_with(|c: char| c.is_alphanumeric() || c == '_'))
        }) {
            let replacement = if name == "$key" {
                key
            } else {
                value.ok_or_else(|| {
                    scanner.error("$value requires a string, number, or boolean iteration value")
                })?
            };
            for c in replacement.chars() {
                match (quote, c) {
                    (Some(_), '\n') => result.push_str("\\a "),
                    (Some(_), '\r') => result.push_str("\\d "),
                    (Some(_), '\u{c}') => result.push_str("\\c "),
                    (Some(q), c) if c == '\\' || c as u32 == u32::from(q) => {
                        result.push('\\');
                        result.push(c);
                    }
                    _ => result.push(c),
                }
            }
            scanner.pos += name.len();
            continue;
        } else {
            scanner.advance();
        }
        result.push_str(&source[start..scanner.pos]);
    }
    Ok(result)
}

/// Interpolation may change a value or selector, but cannot introduce more rules.
pub fn validate_interpolation(text: &str, block: bool) -> Result<(), Error> {
    let source = format!(
        ".interpolation {{ {text}{} }}",
        if block { " {}" } else { ";" }
    );
    let nodes = parse(&source)?;
    let valid = nodes.len() == 1
        && nodes[0].children.as_ref().is_some_and(|children| {
            children.len() == 1
                && children[0].children.is_some() == block
                && children[0].text == text.trim()
        });
    if valid {
        Ok(())
    } else {
        Err(Error::new(
            "EU_PARSE",
            "Iteration substitution must not introduce new rules or declarations",
            0,
        ))
    }
}

/// Find unported Europa functions without matching quoted text or comments.
pub fn unsupported_function(source: &str) -> Result<Option<(usize, &str)>, Error> {
    let mut scanner = Scanner { source, pos: 0 };
    while let Some(c) = scanner.byte() {
        if c.is_ascii_alphabetic() || c == b'_' || c == b'-' {
            let start = scanner.pos;
            while scanner
                .byte()
                .is_some_and(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            {
                scanner.pos += 1;
            }
            let name = &source[start..scanner.pos];
            if scanner.byte() == Some(b'(')
                && matches!(
                    name,
                    "theme" | "ease" | "between" | "vertical-rhythm" | "negate"
                )
            {
                return Ok(Some((start, name)));
            }
        } else if matches!(c, b'(' | b')' | b'[' | b']') {
            scanner.pos += 1;
        } else if !scanner.opaque(0)? {
            scanner.advance();
        }
    }
    Ok(None)
}

/// Find Sass-style identifier concatenation, excluding strings, comments and escapes.
pub fn suffix_offset(selector: &str) -> Result<Option<usize>, Error> {
    let mut scanner = Scanner {
        source: selector,
        pos: 0,
    };
    while let Some(c) = scanner.byte() {
        // Enter selector functions, but skip attribute selectors and strings.
        if c == b'(' || c == b')' {
            scanner.pos += 1;
            continue;
        }
        if scanner.opaque(0)? {
            continue;
        }
        if c == b'&' {
            let next = scanner.source[scanner.pos + 1..].chars().next();
            if next.is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '\\') {
                return Ok(Some(scanner.pos));
            }
        }
        scanner.advance();
    }
    Ok(None)
}

fn space(c: u8) -> bool {
    matches!(c, b' ' | b'\n' | b'\r' | b'\t' | 12)
}

struct Scanner<'a> {
    source: &'a str,
    pos: usize,
}
impl Scanner<'_> {
    fn byte(&self) -> Option<u8> {
        self.source.as_bytes().get(self.pos).copied()
    }
    fn rest(&self) -> &str {
        &self.source[self.pos..]
    }
    fn advance(&mut self) {
        self.pos += self.rest().chars().next().unwrap().len_utf8();
    }
    fn error(&self, message: &str) -> Error {
        Error::new("EU_PARSE", message, self.pos)
    }
    fn escape(&mut self) -> Result<(), Error> {
        self.pos += 1;
        if self.byte().is_none() {
            return Err(self.error("Incomplete escape"));
        }
        if self.byte().unwrap().is_ascii_hexdigit() {
            for _ in 0..6 {
                if self.byte().is_some_and(|c| c.is_ascii_hexdigit()) {
                    self.pos += 1;
                } else {
                    break;
                }
            }
            if self.byte().is_some_and(space) {
                let cr = self.byte() == Some(b'\r');
                self.pos += 1;
                if cr && self.byte() == Some(b'\n') {
                    self.pos += 1;
                }
            }
        } else if self.byte() == Some(b'\r') {
            self.pos += 1;
            if self.byte() == Some(b'\n') {
                self.pos += 1;
            }
        } else {
            self.advance();
        }
        Ok(())
    }
    fn opaque(&mut self, depth: usize) -> Result<bool, Error> {
        if depth > 128 {
            return Err(self.error("Maximum nesting depth exceeded"));
        }
        match self.byte() {
            Some(b'\\') => {
                self.escape()?;
                Ok(true)
            }
            Some(b'\'' | b'"') => {
                let quote = self.byte().unwrap();
                self.pos += 1;
                loop {
                    match self.byte() {
                        Some(c) if c == quote => {
                            self.pos += 1;
                            break;
                        }
                        Some(b'\\') => self.escape()?,
                        Some(b'\n' | b'\r' | 12) | None => {
                            return Err(self.error("Unterminated string"))
                        }
                        _ => self.advance(),
                    }
                }
                Ok(true)
            }
            Some(b'/') if self.rest().starts_with("/*") => {
                let end = self.rest()[2..]
                    .find("*/")
                    .ok_or_else(|| self.error("Unterminated comment"))?;
                self.pos += end + 4;
                Ok(true)
            }
            Some(b'(' | b'[') => {
                self.component(depth + 1)?;
                Ok(true)
            }
            _ => Ok(false),
        }
    }
    fn component(&mut self, depth: usize) -> Result<(), Error> {
        if depth > 128 {
            return Err(self.error("Maximum nesting depth exceeded"));
        }
        let close = match self.byte().unwrap() {
            b'(' => b')',
            b'[' => b']',
            _ => b'}',
        };
        self.pos += 1;
        loop {
            match self.byte() {
                Some(c) if c == close => {
                    self.pos += 1;
                    return Ok(());
                }
                None => return Err(self.error("Unterminated component value")),
                Some(b')' | b']' | b'}') => return Err(self.error("Mismatched closing delimiter")),
                Some(b'{') => self.component(depth + 1)?,
                _ => {
                    if !self.opaque(depth)? {
                        self.advance();
                    }
                }
            }
        }
    }
    fn nodes(&mut self, nested: bool, depth: usize) -> Result<Vec<Node>, Error> {
        if depth > 128 {
            return Err(self.error("Maximum nesting depth exceeded"));
        }
        let mut nodes = Vec::new();
        loop {
            while self.byte().is_some_and(space) || self.byte() == Some(b';') {
                self.pos += 1;
            }
            if self.byte() == Some(b'}') {
                if !nested {
                    return Err(self.error("Unexpected closing brace"));
                }
                self.pos += 1;
                return Ok(nodes);
            }
            if self.byte().is_none() {
                return if nested {
                    Err(self.error("Unterminated block"))
                } else {
                    Ok(nodes)
                };
            }
            let start = self.pos;
            if self.rest().starts_with("/*") {
                self.opaque(depth)?;
                nodes.push(Node::leaf(&self.source[start..self.pos], start));
                continue;
            }
            loop {
                if self.opaque(depth)? {
                    continue;
                }
                match self.byte() {
                    Some(b'{') => {
                        let head = self.source[start..self.pos].trim();
                        // Custom properties may contain arbitrary balanced blocks, including semicolons.
                        if nested && head.starts_with("--") && head.contains(':') {
                            self.component(depth + 1)?;
                            continue;
                        }
                        if head.is_empty() {
                            return Err(self.error("Missing block prelude"));
                        }
                        self.pos += 1;
                        let children = self.nodes(true, depth + 1)?;
                        nodes.push(Node::block(head, children, start));
                        break;
                    }
                    Some(b';' | b'}') | None => {
                        let text = self.source[start..self.pos].trim();
                        if !text.is_empty() {
                            nodes.push(Node::leaf(text, start));
                        }
                        if self.byte() == Some(b';') {
                            self.pos += 1;
                        }
                        break;
                    }
                    Some(b')' | b']') => return Err(self.error("Unexpected closing delimiter")),
                    _ => self.advance(),
                }
            }
        }
    }
}
