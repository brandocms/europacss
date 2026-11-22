//! Europa's structural parser. CSS selectors and property grammars belong to the backend.
//! All offsets are UTF-8 byte offsets into the unmodified source.
use crate::Error;

#[derive(Clone, Debug, PartialEq)]
pub struct Node {
    pub text: String,
    pub children: Option<Vec<Node>>,
    pub offset: usize,
    /// Debug provenance for generated declarations; never part of CSS semantics.
    pub origin_name: Option<String>,
    /// True only for a media wrapper emitted by an Europa directive.
    pub generated_media: bool,
}

impl Node {
    pub fn leaf(text: impl Into<String>, offset: usize) -> Self {
        Self {
            text: text.into(),
            children: None,
            offset,
            origin_name: None,
            generated_media: false,
        }
    }
    pub fn block(text: impl Into<String>, children: Vec<Node>, offset: usize) -> Self {
        Self {
            text: text.into(),
            children: Some(children),
            offset,
            origin_name: None,
            generated_media: false,
        }
    }
    pub(crate) fn generated_media_block(
        text: impl Into<String>,
        children: Vec<Node>,
        offset: usize,
    ) -> Self {
        Self {
            generated_media: true,
            ..Self::block(text, children, offset)
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
    Scanner {
        source,
        pos: if source.starts_with('\u{feff}') { 3 } else { 0 },
    }
    .nodes(false, 0)
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

/// CSS components have lexical boundaries even without spaces, for example
/// `'file.css'layer(ui)supports(display:grid)`. Europa arguments intentionally
/// use whitespace boundaries instead, so `heading/large(2)/1.4` stays together.
pub(crate) fn components(source: &str) -> Result<Vec<&str>, Error> {
    let mut scanner = Scanner { source, pos: 0 };
    let mut values = Vec::new();
    while let Some(c) = scanner.byte() {
        if space(c) {
            scanner.pos += 1;
            continue;
        }
        if scanner.rest().starts_with("/*") {
            scanner.opaque(0)?;
            continue;
        }
        let start = scanner.pos;
        if let Some(name) = scanner.name()? {
            if scanner.byte() == Some(b'(') {
                if is_url(name) {
                    scanner.url_component(0)?;
                } else {
                    scanner.component(0)?;
                }
            }
        } else if !scanner.opaque(0)? {
            if matches!(c, b';' | b'{' | b'}' | b')' | b']') {
                return Err(scanner.error("Unexpected delimiter in CSS components"));
            }
            scanner.advance();
        }
        values.push(&source[start..scanner.pos]);
    }
    Ok(values)
}

/// Split only at the current component-value level, retaining nested CSS intact.
pub fn split_top_level(source: &str, separator: char) -> Result<Vec<&str>, Error> {
    let mut scanner = Scanner { source, pos: 0 };
    let mut start = 0;
    let mut parts = Vec::new();
    while scanner.byte().is_some() {
        if scanner.rest().starts_with(separator) {
            parts.push(source[start..scanner.pos].trim());
            scanner.pos += separator.len_utf8();
            start = scanner.pos;
        } else if let Some(name) = scanner.name()? {
            if is_url(name) && scanner.byte() == Some(b'(') {
                scanner.url_component(0)?;
            } else if name.contains(separator) {
                // Europa arithmetic can split names at '-', while escaped
                // separators and URL payloads remain opaque. Scan each name once.
                let offset = scanner.pos - name.len();
                let mut word = Scanner {
                    source: name,
                    pos: 0,
                };
                while word.byte().is_some() {
                    if word.byte() == Some(b'\\') {
                        word.escape()?;
                    } else if word.rest().starts_with(separator) {
                        parts.push(source[start..offset + word.pos].trim());
                        word.pos += separator.len_utf8();
                        start = offset + word.pos;
                    } else {
                        word.advance();
                    }
                }
            }
        } else if !scanner.opaque(0)? {
            if matches!(scanner.byte(), Some(b')' | b']' | b'}' | b';')) {
                return Err(scanner.error("Unexpected delimiter in value"));
            }
            scanner.advance();
        }
    }
    parts.push(source[start..].trim());
    Ok(parts)
}

/// Visit words and functions in CSS values, excluding strings, comments, escapes,
/// and URL payloads. A handled function owns its arguments; other functions recurse.
/// Europa var[...] references are surfaced as functions named "var[]".
pub fn rewrite_value(
    source: &str,
    mapper: &mut impl FnMut(&str, Option<&str>) -> Result<Option<String>, Error>,
) -> Result<String, Error> {
    rewrite_components(source, mapper, false)
}

pub(crate) fn rewrite_urls(
    source: &str,
    mapper: &mut impl FnMut(&str) -> Result<String, Error>,
) -> Result<String, Error> {
    rewrite_components(
        source,
        &mut |name, args| {
            let Some(args) = args else {
                return Ok(None);
            };
            let decoded = decode_string(name, 0)?;
            if decoded.eq_ignore_ascii_case("url") {
                Ok(Some(format!("url({})", mapper(args)?)))
            } else if decoded.eq_ignore_ascii_case("image-set")
                || decoded.eq_ignore_ascii_case("-webkit-image-set")
            {
                let mut items = Vec::new();
                for item in split_top_level(args, ',')? {
                    let mut scanner = Scanner {
                        source: item,
                        pos: 0,
                    };
                    while scanner.byte().is_some_and(space) || scanner.rest().starts_with("/*") {
                        if !scanner.opaque(0)? {
                            scanner.pos += 1;
                        }
                    }
                    if matches!(scanner.byte(), Some(b'\'' | b'"')) {
                        let start = scanner.pos;
                        scanner.opaque(0)?;
                        items.push(format!(
                            "{}{}{}",
                            &item[..start],
                            mapper(&item[start..scanner.pos])?,
                            rewrite_urls(&item[scanner.pos..], mapper)?
                        ));
                    } else {
                        items.push(rewrite_urls(item, mapper)?);
                    }
                }
                Ok(Some(format!("{name}({})", items.join(", "))))
            } else {
                Ok(None)
            }
        },
        true,
    )
}

fn rewrite_components(
    source: &str,
    mapper: &mut impl FnMut(&str, Option<&str>) -> Result<Option<String>, Error>,
    urls: bool,
) -> Result<String, Error> {
    fn rewrite(
        source: &str,
        mapper: &mut impl FnMut(&str, Option<&str>) -> Result<Option<String>, Error>,
        depth: usize,
        urls: bool,
    ) -> Result<String, Error> {
        if depth > 128 {
            return Err(Error::new(
                "EU_LIMIT",
                "Maximum value nesting depth exceeded",
                0,
            ));
        }
        let mut scanner = Scanner { source, pos: 0 };
        let mut result = String::new();
        while let Some(c) = scanner.byte() {
            let start = scanner.pos;
            if c.is_ascii_alphanumeric()
                || matches!(c, b'_' | b'-' | b'.' | b'+')
                || c >= 128
                || c == b'\\'
            {
                if c == b'\\' {
                    scanner.escape()?;
                } else {
                    scanner.advance();
                }
                loop {
                    if scanner.byte() == Some(b'\\') {
                        scanner.escape()?;
                    } else if scanner.rest().chars().next().is_some_and(|c| {
                        c.is_alphanumeric() || matches!(c, '_' | '-' | '.' | '+' | '%')
                    }) {
                        scanner.advance();
                    } else {
                        break;
                    }
                }
                let name = &source[start..scanner.pos];
                if scanner.byte() == Some(b'(') || name == "var" && scanner.byte() == Some(b'[') {
                    let bracket = scanner.byte() == Some(b'[');
                    let inner = scanner.pos + 1;
                    if is_url(name) && !bracket {
                        scanner.url_component(depth + 1)?;
                    } else {
                        scanner.component(depth + 1)?;
                    }
                    let args = &source[inner..scanner.pos - 1];
                    if !urls && (is_url(name) || name.contains('\\')) {
                        result.push_str(&source[start..scanner.pos]);
                    } else if let Some(value) =
                        mapper(if bracket { "var[]" } else { name }, Some(args))?
                    {
                        result.push_str(&value);
                    } else {
                        result.push_str(name);
                        result.push(if bracket { '[' } else { '(' });
                        result.push_str(&rewrite(args, mapper, depth + 1, urls)?);
                        result.push(if bracket { ']' } else { ')' });
                    }
                } else {
                    if name.contains('\\') && !urls {
                        result.push_str(name);
                    } else {
                        result.push_str(&mapper(name, None)?.unwrap_or_else(|| name.into()));
                    }
                }
            } else if matches!(c, b'(' | b'[') {
                scanner.component(depth + 1)?;
                result.push(char::from(c));
                result.push_str(&rewrite(
                    &source[start + 1..scanner.pos - 1],
                    mapper,
                    depth + 1,
                    urls,
                )?);
                result.push(if c == b'(' { ')' } else { ']' });
            } else if scanner.opaque(depth)? {
                result.push_str(&source[start..scanner.pos]);
            } else {
                scanner.advance();
                result.push_str(&source[start..scanner.pos]);
            }
        }
        Ok(result)
    }
    rewrite(source, mapper, 0, urls)
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
        let start = scanner.pos;
        if let Some(name) = scanner.name()? {
            if is_url(name) && scanner.byte() == Some(b'(') {
                scanner.url_component(0)?;
                continue;
            }
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

/// Authored nesting selectors, excluding attributes, strings, comments and escapes.
pub(crate) fn nesting_offsets(selector: &str) -> Result<Vec<usize>, Error> {
    let mut scanner = Scanner {
        source: selector,
        pos: 0,
    };
    let mut offsets = Vec::new();
    while let Some(c) = scanner.byte() {
        if matches!(c, b'(' | b')') {
            scanner.pos += 1;
        } else if scanner.opaque(0)? {
            continue;
        } else {
            if c == b'&' {
                offsets.push(scanner.pos);
            }
            scanner.advance();
        }
    }
    Ok(offsets)
}

pub(crate) fn nesting_crosses_combinator(selector: &str) -> Result<bool, Error> {
    let mut scanner = Scanner {
        source: selector,
        pos: 0,
    };
    let mut seen = false;
    let mut combinator = false;
    while let Some(c) = scanner.byte() {
        if scanner.opaque(0)? {
            continue;
        }
        if c == b'&' {
            if seen && combinator {
                return Ok(true);
            }
            seen = true;
        } else if seen && (space(c) || matches!(c, b'>' | b'+' | b'~')) {
            combinator = true;
        }
        scanner.advance();
    }
    Ok(false)
}

pub(crate) fn block_end(source: &str, offset: usize) -> Result<usize, Error> {
    let mut scanner = Scanner {
        source,
        pos: offset,
    };
    while scanner.byte().is_some() {
        if scanner.byte() == Some(b'{') {
            scanner.component(0)?;
            return Ok(scanner.pos);
        }
        if !scanner.opaque(0)? {
            scanner.advance();
        }
    }
    Err(scanner.error("Expected a block"))
}

fn space(c: u8) -> bool {
    matches!(c, b' ' | b'\n' | b'\r' | b'\t' | 12)
}

fn is_url(name: &str) -> bool {
    name.eq_ignore_ascii_case("url")
        || name.contains('\\')
            && decode_string(name, 0).is_ok_and(|name| name.eq_ignore_ascii_case("url"))
}

struct Scanner<'a> {
    source: &'a str,
    pos: usize,
}
impl<'a> Scanner<'a> {
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
    fn name(&mut self) -> Result<Option<&'a str>, Error> {
        let start = self.pos;
        loop {
            match self.byte() {
                Some(b'\\') => self.escape()?,
                Some(c) if c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-') || c >= 128 => {
                    self.advance()
                }
                _ => break,
            }
        }
        Ok((self.pos > start).then_some(&self.source[start..self.pos]))
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
        if let Some(name) = self.name()? {
            if is_url(name) && self.byte() == Some(b'(') {
                self.url_component(depth + 1)?;
            }
            return Ok(true);
        }
        match self.byte() {
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
    /// CSS Syntax distinguishes unquoted URL tokens from ordinary functions.
    /// https://drafts.csswg.org/css-syntax-3/#consume-url-token
    fn url_component(&mut self, depth: usize) -> Result<(), Error> {
        if depth > 128 {
            return Err(self.error("Maximum nesting depth exceeded"));
        }
        let start = self.pos;
        self.pos += 1;
        while self.byte().is_some_and(space) {
            self.pos += 1;
        }
        if matches!(self.byte(), Some(b'\'' | b'"')) {
            self.pos = start;
            return self.component(depth);
        }
        loop {
            match self.byte() {
                Some(b')') => {
                    self.pos += 1;
                    return Ok(());
                }
                None => return Err(self.error("Unterminated URL")),
                Some(c) if space(c) => {
                    while self.byte().is_some_and(space) {
                        self.pos += 1;
                    }
                    if self.byte() != Some(b')') {
                        return Err(self.error("Whitespace inside an unquoted URL"));
                    }
                }
                Some(b'\\') => {
                    if self
                        .source
                        .as_bytes()
                        .get(self.pos + 1)
                        .is_some_and(|c| matches!(c, b'\n' | b'\r' | 12))
                    {
                        return Err(self.error("Invalid escape in an unquoted URL"));
                    }
                    self.escape()?;
                }
                Some(b'\'' | b'"' | b'(' | 1..=8 | 11 | 14..=31 | 127) => {
                    return Err(self.error("Invalid character in an unquoted URL"));
                }
                _ => self.advance(),
            }
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

pub(crate) fn decode_string(raw: &str, offset: usize) -> Result<String, Error> {
    let raw = raw.trim();
    let quoted = raw.starts_with(['\'', '"']);
    let raw = if quoted {
        if raw.len() < 2 || raw.as_bytes().last() != raw.as_bytes().first() {
            return Err(Error::new("EU_URL", "Invalid quoted CSS URL", offset));
        }
        &raw[1..raw.len() - 1]
    } else {
        raw
    };
    let mut chars = raw.chars().peekable();
    let mut result = String::new();
    while let Some(c) = chars.next() {
        if c != '\\' {
            if !quoted && (c.is_whitespace() || matches!(c, '\'' | '"' | '(' | ')')) {
                return Err(Error::new("EU_URL", "Invalid unquoted CSS URL", offset));
            }
            result.push(c);
            continue;
        }
        let Some(c) = chars.next() else {
            return Err(Error::new("EU_URL", "Incomplete CSS escape", offset));
        };
        if c.is_ascii_hexdigit() {
            let mut digits = c.to_string();
            while digits.len() < 6 && chars.peek().is_some_and(|c| c.is_ascii_hexdigit()) {
                digits.push(chars.next().unwrap());
            }
            if chars
                .peek()
                .is_some_and(|c| matches!(c, ' ' | '\t' | '\r' | '\n' | '\u{c}'))
            {
                let whitespace = chars.next();
                if whitespace == Some('\r') && chars.peek() == Some(&'\n') {
                    chars.next();
                }
            }
            let number = u32::from_str_radix(&digits, 16).unwrap();
            result.push(
                char::from_u32(number)
                    .filter(|c| *c != '\0')
                    .unwrap_or('\u{fffd}'),
            );
        } else if matches!(c, '\r' | '\n' | '\u{c}') {
            if !quoted {
                return Err(Error::new(
                    "EU_URL",
                    "Unquoted URL cannot contain a line continuation",
                    offset,
                ));
            }
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
        } else {
            result.push(c);
        }
    }
    Ok(result)
}
