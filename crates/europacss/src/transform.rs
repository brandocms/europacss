use crate::{
    config::{lookup, scalar, Config},
    parser::{
        arguments, interpolate, suffix_offset, unsupported_function, validate_interpolation, Node,
    },
    Error,
};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Default)]
struct Context {
    style: bool,
    responsive: Option<String>,
    iteration: Option<(String, Option<String>)>,
}

pub fn transform(nodes: Vec<Node>, config: &Config<'_>) -> Result<Vec<Node>, Error> {
    let mut compiler = Compiler {
        config,
        placeholders: HashMap::new(),
        expanding: Vec::new(),
        visited: 0,
    };
    for node in &nodes {
        if node.text.starts_with('%') {
            if !placeholder(&node.text) || node.children.is_none() {
                return Err(error(
                    node,
                    "EU_PLACEHOLDER",
                    "A placeholder must be a single %name block",
                ));
            }
            if compiler
                .placeholders
                .insert(node.text.clone(), node.children.clone().unwrap())
                .is_some()
            {
                return Err(error(
                    node,
                    "EU_PLACEHOLDER",
                    "Duplicate placeholder definition",
                ));
            }
        }
    }
    let result = compiler.nodes(nodes, &Context::default(), 0)?;
    validate_values(&result)?;
    Ok(result)
}

fn validate_values(nodes: &[Node]) -> Result<(), Error> {
    for node in nodes {
        if let Some(children) = &node.children {
            validate_values(children)?;
        } else if let Some((_, name)) =
            unsupported_function(&node.text).map_err(|e| error(node, &e.code, e.message))?
        {
            return Err(error(
                node,
                "EU_UNSUPPORTED",
                format!("Europa function {name}() is not implemented yet"),
            ));
        }
    }
    Ok(())
}

struct Compiler<'a, 'b> {
    config: &'a Config<'b>,
    placeholders: HashMap<String, Vec<Node>>,
    expanding: Vec<String>,
    visited: usize,
}

fn error(node: &Node, code: &str, message: impl Into<String>) -> Error {
    Error::new(code, message, node.offset)
}
fn placeholder(s: &str) -> bool {
    s.len() > 1
        && s.starts_with('%')
        && s[1..]
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}
fn decl(prop: &str, value: &str, node: &Node, important: bool) -> Node {
    Node::leaf(
        format!(
            "{prop}: {value}{}",
            if important { " !important" } else { "" }
        ),
        node.offset,
    )
}

impl Compiler<'_, '_> {
    fn nodes(&mut self, nodes: Vec<Node>, ctx: &Context, depth: usize) -> Result<Vec<Node>, Error> {
        if depth > 128 {
            return Err(Error::new(
                "EU_LIMIT",
                "Maximum expansion depth exceeded",
                nodes.first().map_or(0, |n| n.offset),
            ));
        }
        let mut result = Vec::new();
        for mut node in nodes {
            self.visit(&node)?;
            if let Some((key, value)) = &ctx.iteration {
                let text = interpolate(&node.text, key, value.as_deref())
                    .map_err(|e| error(&node, "EU_ITERATE", e.message))?;
                if text != node.text {
                    validate_interpolation(&text, node.children.is_some())
                        .map_err(|e| error(&node, "EU_ITERATE", e.message))?;
                    node.text = text;
                }
            }
            if let Some((name, params)) = node.at_rule() {
                let name = name.to_owned();
                let params = params.to_owned();
                let args = arguments(&params).map_err(|e| error(&node, &e.code, e.message))?;
                match name.as_str() {
                    "iterate" => {
                        arity(&node, &args, 1, 1)?;
                        if !ctx.style { return Err(error(&node, "EU_CONTEXT", "@iterate must be inside a style rule")); }
                        let children = node.children.as_ref().ok_or_else(|| error(&node, "EU_ARGUMENTS", "@iterate requires a block"))?;
                        let values = lookup(self.config.value, args[0]).ok_or_else(|| error(&node, "EU_CONFIG", format!("Unknown iterable `{}`", args[0])))?;
                        let entries: Box<dyn Iterator<Item = (String, &Value)>> = match values {
                            Value::Object(values) => Box::new(values.iter().map(|(k, v)| (k.clone(), v))),
                            Value::Array(values) => Box::new(values.iter().enumerate().map(|(i, v)| (i.to_string(), v))),
                            _ => return Err(error(&node, "EU_ITERATE", "@iterate requires an object or array")),
                        };
                        for (key, value) in entries {
                            self.visit(&node)?;
                            let value = scalar(value).or_else(|| value.as_bool().map(|v| v.to_string()));
                            let child_ctx = Context { iteration: Some((key, value)), ..ctx.clone() };
                            result.extend(self.nodes(children.clone(), &child_ctx, depth + 1)?);
                        }
                    }
                    "unpack" => {
                        self.statement(&node, ctx)?;
                        arity(&node, &args, 1, 1)?;
                        let generated = self.unpack(&node, args[0])?;
                        // Interpolation has already happened at the use site; config values
                        // must not accidentally acquire bindings from a surrounding iterator.
                        let child_ctx = Context { iteration: None, ..ctx.clone() };
                        result.extend(self.nodes(generated, &child_ctx, depth + 1)?);
                    }
                    "responsive" => {
                        arity(&node, &args, 1, 1)?;
                        if ctx.responsive.is_some() { return Err(error(&node, "EU_RESPONSIVE", "Nested @responsive is not supported; combine the breakpoint query")); }
                        let media = self.config.media(args[0], node.offset)?;
                        let children = node.children.clone().ok_or_else(|| error(&node, "EU_ARGUMENTS", "@responsive requires a block"))?;
                        let child_ctx = Context { responsive: Some(args[0].into()), ..ctx.clone() };
                        let children = self.nodes(children, &child_ctx, depth + 1)?;
                        result.push(Node::block(format!("@media {media}"), children, node.offset));
                    }
                    "if" => {
                        arity(&node, &args, 1, 1)?;
                        let value = lookup(self.config.value, args[0]).ok_or_else(|| error(&node, "EU_CONFIG", format!("Unknown config key `{}`", args[0])))?;
                        let children = node.children.clone().ok_or_else(|| error(&node, "EU_ARGUMENTS", "@if requires a block"))?;
                        let truthy = match value { Value::Null => false, Value::Bool(v) => *v, Value::Number(v) => v.as_f64() != Some(0.0), Value::String(v) => !v.is_empty(), _ => true };
                        if truthy { result.extend(self.nodes(children, ctx, depth + 1)?); }
                    }
                    "extend" => {
                        self.statement(&node, ctx)?;
                        arity(&node, &args, 1, 1)?;
                        if !placeholder(args[0]) { return Err(error(&node, "EU_EXTEND", "@extend supports named %placeholders only")); }
                        if self.expanding.iter().any(|s| s == args[0]) { return Err(error(&node, "EU_EXTEND", format!("Cyclic placeholder expansion: {} -> {}", self.expanding.join(" -> "), args[0]))); }
                        let children = self.placeholders.get(args[0]).cloned().ok_or_else(|| error(&node, "EU_EXTEND", format!("Unknown placeholder `{}`", args[0])))?;
                        self.expanding.push(args[0].into());
                        result.extend(self.nodes(children, ctx, depth + 1)?);
                        self.expanding.pop();
                    }
                    "color" | "color!" | "display" | "order" | "font" | "fontsize" | "space" | "space!" | "column-offset" | "abs100" | "abs100!" | "embed-responsive" => {
                        self.statement(&node, ctx)?;
                        let mut generated = self.directive(&node, &name, &args, ctx)?;
                        result.append(&mut generated);
                    }
                    "nest" => return Err(error(&node, "EU_LEGACY_NEST", "Replace legacy @nest with a native nested selector")),
                    "import" => return Err(error(&node, "EU_UNSUPPORTED", "Import resolution is not implemented in the experimental compiler; supply a bundled stylesheet")),
                    "europa" | "column" | "row" | "grid" | "at-root" => {
                        return Err(error(&node, "EU_UNSUPPORTED", format!("@{name} is not implemented in the experimental compiler yet")));
                    }
                    _ => {
                        if name.ends_with('!') {
                            return Err(error(&node, "EU_UNSUPPORTED", format!("Unsupported important directive @{name}")));
                        }
                        if let Some(children) = node.children.take() {
                            let child_ctx = Context { style: ctx.style || matches!(name.as_str(), "font-face" | "page" | "property" | "counter-style" | "font-palette-values" | "font-feature-values" | "position-try" | "view-transition" | "color-profile"), ..ctx.clone() };
                            node.children = Some(self.nodes(children, &child_ctx, depth + 1)?);
                        }
                        result.push(node);
                    }
                }
            } else if node.children.is_some() {
                if node.text.starts_with('%') {
                    if depth != 0 {
                        return Err(error(
                            &node,
                            "EU_PLACEHOLDER",
                            "Placeholders must be defined at the stylesheet root",
                        ));
                    }
                    continue;
                }
                if let Some(offset) = suffix_offset(&node.text)? {
                    return Err(Error::new("EU_LEGACY_SUFFIX", "Identifier suffix nesting is not supported; migrate to an explicit selector such as .card__title", node.offset + if ctx.iteration.is_some() { 0 } else { offset }));
                }
                let children = node.children.take().unwrap();
                node.children = Some(self.nodes(
                    children,
                    &Context {
                        style: true,
                        ..ctx.clone()
                    },
                    depth + 1,
                )?);
                result.push(node);
            } else {
                if !node.text.starts_with("/*") && !ctx.style {
                    return Err(error(
                        &node,
                        "EU_PARSE",
                        "Declarations must be inside a style or declaration rule",
                    ));
                }
                result.push(node);
            }
        }
        Ok(result)
    }

    fn visit(&mut self, node: &Node) -> Result<(), Error> {
        self.visited += 1;
        if self.visited > 100_000 {
            Err(error(
                node,
                "EU_LIMIT",
                "Maximum expanded node count exceeded",
            ))
        } else {
            Ok(())
        }
    }

    fn unpack(&self, node: &Node, path: &str) -> Result<Vec<Node>, Error> {
        let (path, property) = match path {
            "containerPadding" => ("theme.container.padding", Some("--container-padding")),
            "gridGutter" => ("theme.columns.gutters", Some("--grid-gutter")),
            _ => (path, None),
        };
        let values = lookup(self.config.value, path)
            .and_then(Value::as_object)
            .ok_or_else(|| {
                error(
                    node,
                    "EU_CONFIG",
                    format!("@unpack requires a breakpoint object at `{path}`"),
                )
            })?;
        let mut result = Vec::new();
        for (query, value) in values {
            let children = if let Some(property) = property {
                let value = scalar(value).ok_or_else(|| {
                    error(
                        node,
                        "EU_CONFIG",
                        format!("Expected a CSS size at `{path}.{query}`"),
                    )
                })?;
                if value.ends_with("dpx") {
                    for index in self.config.select(query, node.offset)? {
                        let size =
                            crate::size::design_pixels(&value, self.config, index, node.offset)?;
                        result.push(Node::block(
                            format!("@media {}", self.config.media_indices(&[index])),
                            vec![decl(property, &size, node, false)],
                            node.offset,
                        ));
                    }
                    continue;
                }
                self.check_size(node, &value)?;
                vec![decl(property, &value, node, false)]
            } else {
                value
                    .as_object()
                    .ok_or_else(|| {
                        error(
                            node,
                            "EU_CONFIG",
                            format!("Expected a property object at `{path}.{query}`"),
                        )
                    })?
                    .iter()
                    .map(|(property, value)| {
                        if property.starts_with('@') || property.trim().is_empty() {
                            return Err(error(
                                node,
                                "EU_CONFIG",
                                "@unpack entries must be CSS properties",
                            ));
                        }
                        let value = css_value(value, property, node)?;
                        let declaration = decl(property, &value, node, false);
                        validate_interpolation(&declaration.text, false)
                            .map_err(|e| error(node, "EU_CONFIG", e.message))?;
                        Ok(declaration)
                    })
                    .collect::<Result<Vec<_>, Error>>()?
            };
            result.push(Node::block(
                format!("@media {}", self.config.media(query, node.offset)?),
                children,
                node.offset,
            ));
        }
        Ok(result)
    }

    fn statement(&self, node: &Node, ctx: &Context) -> Result<(), Error> {
        if !ctx.style {
            return Err(error(
                node,
                "EU_CONTEXT",
                "This directive must be inside a style rule",
            ));
        }
        if node.children.is_some() {
            return Err(error(
                node,
                "EU_ARGUMENTS",
                "This directive does not accept a block",
            ));
        }
        Ok(())
    }

    fn wrap(
        &self,
        node: &Node,
        nodes: Vec<Node>,
        query: Option<&str>,
        ctx: &Context,
    ) -> Result<Vec<Node>, Error> {
        match query {
            Some(_) if ctx.responsive.is_some() => Err(error(
                node,
                "EU_RESPONSIVE",
                "A directive inside @responsive cannot have its own breakpoint query",
            )),
            Some(query) => Ok(vec![Node::block(
                format!("@media {}", self.config.media(query, node.offset)?),
                nodes,
                node.offset,
            )]),
            None => Ok(nodes),
        }
    }

    fn directive(
        &self,
        node: &Node,
        name: &str,
        args: &[&str],
        ctx: &Context,
    ) -> Result<Vec<Node>, Error> {
        let important = name.ends_with('!');
        match name {
            "abs100" | "abs100!" => {
                arity(node, args, 0, 1)?;
                let nodes = [
                    ("position", "absolute"),
                    ("width", "100%"),
                    ("height", "100%"),
                    ("top", "0"),
                    ("left", "0"),
                ]
                .into_iter()
                .map(|(p, v)| decl(p, v, node, important))
                .collect();
                self.wrap(node, nodes, args.first().copied(), ctx)
            }
            "embed-responsive" => {
                arity(node, args, 1, 1)?;
                let ratio = args[0].split_once('/').and_then(|(w, h)| Some((w.parse::<f64>().ok()?, h.parse::<f64>().ok()?)))
                    .filter(|(w, h)| w.is_finite() && h.is_finite() && *w > 0.0 && *h > 0.0)
                    .map(|(w, h)| h / w * 100.0)
                    .filter(|n| n.is_finite() && *n > 0.0)
                    .ok_or_else(|| error(node, "EU_ARGUMENTS", "@embed-responsive requires a positive width/height ratio, such as 16/9"))?;
                let padding = format!("{ratio}%");
                Ok(vec![
                    decl("position", "relative", node, false),
                    decl("width", "100%", node, false),
                    Node::block(
                        "&::before",
                        vec![
                            decl("display", "block", node, false),
                            decl("content", "\"\"", node, false),
                            decl("padding-top", &padding, node, false),
                        ],
                        node.offset,
                    ),
                    Node::block(
                        "iframe, embed, object, video",
                        [
                            ("position", "absolute"),
                            ("top", "0"),
                            ("left", "0"),
                            ("width", "100%"),
                            ("height", "100%"),
                            ("border", "0"),
                        ]
                        .into_iter()
                        .map(|(p, v)| decl(p, v, node, false))
                        .collect(),
                        node.offset,
                    ),
                ])
            }
            "color" | "color!" => {
                arity(node, args, 2, 3)?;
                let prop = match args[0] {
                    "fg" => "color",
                    "bg" => "background-color",
                    "fill" => "fill",
                    "stroke" => "stroke",
                    "border" => "border-color",
                    "border-top" => "border-top-color",
                    "border-right" => "border-right-color",
                    "border-bottom" => "border-bottom-color",
                    "border-left" => "border-left-color",
                    _ => {
                        return Err(error(
                            node,
                            "EU_ARGUMENTS",
                            format!("Unknown @color target `{}`", args[0]),
                        ))
                    }
                };
                let value = match self.config.get("/theme/colors", args[1]) {
                    Some(v) => scalar(v).ok_or_else(|| {
                        error(node, "EU_CONFIG", "A color token must resolve to a string")
                    })?,
                    None => args[1].into(),
                };
                self.wrap(
                    node,
                    vec![decl(prop, &value, node, important)],
                    args.get(2).copied(),
                    ctx,
                )
            }
            "display" | "order" => {
                arity(node, args, 1, 2)?;
                let parts: Vec<_> = if name == "display" {
                    args[0].split('/').collect()
                } else {
                    vec![args[0]]
                };
                if parts.len() > 3 || parts.iter().any(|v| v.is_empty()) {
                    return Err(error(
                        node,
                        "EU_ARGUMENTS",
                        "Invalid display/direction/wrap shorthand",
                    ));
                }
                let props = if name == "display" {
                    ["display", "flex-direction", "flex-wrap"]
                } else {
                    ["order", "", ""]
                };
                self.wrap(
                    node,
                    parts
                        .iter()
                        .zip(props)
                        .map(|(v, p)| decl(p, v, node, false))
                        .collect(),
                    args.get(1).copied(),
                    ctx,
                )
            }
            "font" => {
                arity(node, args, 1, 3)?;
                let value = self
                    .config
                    .get("/theme/typography/families", args[0])
                    .ok_or_else(|| {
                        error(
                            node,
                            "EU_CONFIG",
                            format!("Unknown font family `{}`", args[0]),
                        )
                    })?;
                let family = css_value(value, "font-family", node)?;
                let mut result = vec![decl("font-family", &family, node, false)];
                if args.len() > 1 {
                    result.extend(self.sizes(node, &args[1..], ctx, true, false)?);
                }
                Ok(result)
            }
            "fontsize" => self.sizes(node, args, ctx, true, false),
            "space" | "space!" => self.sizes(node, args, ctx, false, important),
            "column-offset" => {
                let mut args = args.to_vec();
                args.insert(0, "margin-left");
                self.sizes(node, &args, ctx, false, false)
            }
            _ => unreachable!(),
        }
    }

    fn sizes(
        &self,
        node: &Node,
        args: &[&str],
        ctx: &Context,
        font: bool,
        important: bool,
    ) -> Result<Vec<Node>, Error> {
        let start = usize::from(!font);
        arity(node, args, start + 1, start + 2)?;
        let prop = if font { "font-size" } else { args[0] };
        let size = args[start];
        let query = args.get(start + 1).copied();
        if query.is_some() && ctx.responsive.is_some() {
            return Err(error(
                node,
                "EU_RESPONSIVE",
                "A directive inside @responsive cannot have its own breakpoint query",
            ));
        }
        let props = match prop {
            "padding-x" => vec!["padding-left", "padding-right"],
            "padding-y" => vec!["padding-top", "padding-bottom"],
            "margin-x" => vec!["margin-left", "margin-right"],
            "margin-y" => vec!["margin-top", "margin-bottom"],
            "container" | "breakout" | "translateX" | "translateY" => {
                return Err(error(
                    node,
                    "EU_UNSUPPORTED",
                    format!("@space {prop} is not implemented yet"),
                ))
            }
            _ => vec![prop],
        };
        if !props
            .iter()
            .all(|p| p.chars().all(|c| c.is_ascii_alphabetic() || c == '-') && !p.is_empty())
        {
            return Err(error(node, "EU_ARGUMENTS", "Invalid CSS property"));
        }
        let base = if font {
            "/theme/typography/sizes"
        } else {
            "/theme/spacing"
        };
        let token = self.config.get(base, size);
        let make_decls = |value: &Value| -> Result<Vec<Node>, Error> {
            if font && value.is_object() {
                return value
                    .as_object()
                    .unwrap()
                    .iter()
                    .map(|(p, v)| {
                        let value = css_value(v, p, node)?;
                        if p == "font-size" {
                            self.check_size(node, &value)?;
                        }
                        Ok(decl(p, &value, node, important))
                    })
                    .collect();
            }
            let value = scalar(value)
                .ok_or_else(|| error(node, "EU_CONFIG", "A size must resolve to a CSS value"))?;
            self.check_size(node, &value)?;
            Ok(props
                .iter()
                .map(|p| decl(p, &value, node, important))
                .collect())
        };
        if let Some(token) = token {
            if let Some(values) = token.as_object() {
                let mut result = Vec::new();
                if font {
                    if let Some(base) = values.get("__base__") {
                        result.extend(make_decls(base)?);
                    }
                }
                let indices = match query.or(ctx.responsive.as_deref()) {
                    Some(q) => self.config.select(q, node.offset)?,
                    None => (0..self.config.breakpoints.len()).collect(),
                };
                if indices.is_empty() && self.config.breakpoints.is_empty() {
                    return Err(error(
                        node,
                        "EU_CONFIG",
                        "Named responsive sizes require breakpoints",
                    ));
                }
                for index in indices {
                    let key = &self.config.breakpoints[index].0;
                    let value = values.get(key).ok_or_else(|| {
                        error(
                            node,
                            "EU_CONFIG",
                            format!("Size `{size}` has no value for breakpoint `{key}`"),
                        )
                    })?;
                    let decls = make_decls(value)?;
                    result.push(Node::block(
                        format!("@media {}", self.config.media_indices(&[index])),
                        decls,
                        node.offset,
                    ));
                }
                return Ok(result);
            }
            return self.wrap(node, make_decls(token)?, query, ctx);
        }
        self.wrap(node, make_decls(&Value::String(size.into()))?, query, ctx)
    }

    fn check_size(&self, node: &Node, value: &str) -> Result<(), Error> {
        if !literal_size(value) {
            return Err(error(
                node,
                "EU_UNSUPPORTED",
                format!("Size expression `{value}` is not implemented yet"),
            ));
        }
        if self
            .config
            .value
            .get("setMaxForVw")
            .and_then(Value::as_bool)
            == Some(true)
            && value.contains("vw")
        {
            return Err(error(
                node,
                "EU_UNSUPPORTED",
                "setMaxForVw sizing is not implemented yet",
            ));
        }
        Ok(())
    }
}

fn arity(node: &Node, args: &[&str], min: usize, max: usize) -> Result<(), Error> {
    if args.len() < min || args.len() > max {
        Err(error(
            node,
            "EU_ARGUMENTS",
            format!("Expected {min}–{max} arguments, received {}", args.len()),
        ))
    } else {
        Ok(())
    }
}

fn css_value(value: &Value, property: &str, node: &Node) -> Result<String, Error> {
    if let Some(values) = value.as_array() {
        let sep = match property {
            "font-family" | "background-image" | "box-shadow" | "text-shadow" | "transition"
            | "animation" => ", ",
            "filter" | "transform" => " ",
            _ => {
                return Err(error(
                    node,
                    "EU_CONFIG",
                    format!("Arrays are not supported for `{property}`"),
                ))
            }
        };
        return values
            .iter()
            .map(|v| {
                scalar(v).ok_or_else(|| error(node, "EU_CONFIG", "Expected scalar array values"))
            })
            .collect::<Result<Vec<_>, _>>()
            .map(|v| v.join(sep));
    }
    scalar(value).ok_or_else(|| error(node, "EU_CONFIG", format!("Invalid value for `{property}`")))
}

fn literal_size(value: &str) -> bool {
    if matches!(
        value,
        "0" | "auto"
            | "inherit"
            | "initial"
            | "unset"
            | "revert"
            | "revert-layer"
            | "none"
            | "normal"
            | "min-content"
            | "max-content"
            | "fit-content"
    ) {
        return true;
    }
    if ["var(", "calc(", "min(", "max(", "clamp(", "env("]
        .iter()
        .any(|p| value.starts_with(p))
    {
        return !["dpx", "theme(", "between(", "vertical-rhythm(", "negate("]
            .iter()
            .any(|p| value.contains(p));
    }
    let end = value
        .find(|c: char| !(c.is_ascii_digit() || matches!(c, '.' | '+' | '-')))
        .unwrap_or(value.len());
    if value[..end].parse::<f64>().is_err() {
        return false;
    }
    matches!(
        &value[end..],
        "px" | "rem"
            | "em"
            | "%"
            | "vw"
            | "vh"
            | "vmin"
            | "vmax"
            | "svh"
            | "lvh"
            | "dvh"
            | "svw"
            | "lvw"
            | "dvw"
            | "ch"
            | "ex"
            | "lh"
            | "rlh"
            | "cm"
            | "mm"
            | "in"
            | "pt"
            | "pc"
            | "cqw"
            | "cqh"
            | "cqi"
            | "cqb"
            | "cqmin"
            | "cqmax"
    )
}
