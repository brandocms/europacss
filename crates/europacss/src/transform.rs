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
    transform_mode(nodes, config, false)
}

/// Keep suffix selectors available to migration analysis; compilation still rejects them.
pub(crate) fn for_migration(nodes: Vec<Node>, config: &Config<'_>) -> Result<Vec<Node>, Error> {
    transform_mode(nodes, config, true)
}

fn transform_mode(
    nodes: Vec<Node>,
    config: &Config<'_>,
    migration: bool,
) -> Result<Vec<Node>, Error> {
    let mut compiler = Compiler {
        config,
        placeholders: HashMap::new(),
        expanding: Vec::new(),
        visited: 0,
        migration,
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
    let mut result = compiler.nodes(nodes, &Context::default(), 0)?;
    validate_values(&mut result, config.value)?;
    Ok(crate::cascade::media_last(result))
}

fn validate_values(nodes: &mut [Node], config: &Value) -> Result<(), Error> {
    for node in nodes {
        if let Some(children) = &mut node.children {
            validate_values(children, config)?;
        } else if !node.text.starts_with("/*") && node.at_rule().is_none() {
            if let Some((property, value)) = node.text.split_once(':') {
                let value = crate::value_functions::resolve(value, config, node.offset)?;
                let text = format!("{property}:{value}");
                if text != node.text {
                    validate_interpolation(&text, false)
                        .map_err(|e| error(node, "EU_FUNCTION", e.message))?;
                    node.text = text;
                }
                validate_interpolation(&node.text, false).map_err(|_| {
                    error(node, "EU_DECLARATION", "Expected one CSS declaration; a value must not introduce extra declarations or rules")
                })?;
            }
            if let Some((_, name)) =
                unsupported_function(&node.text).map_err(|e| error(node, &e.code, e.message))?
            {
                return Err(error(
                    node,
                    "EU_UNSUPPORTED",
                    format!("Europa function {name}() is not implemented yet"),
                ));
            }
        }
    }
    Ok(())
}

struct Compiler<'a, 'b> {
    config: &'a Config<'b>,
    placeholders: HashMap<String, Vec<Node>>,
    expanding: Vec<String>,
    visited: usize,
    migration: bool,
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
                let params =
                    crate::value_functions::resolve(params, self.config.value, node.offset)?;
                let text = format!(
                    "@{name}{}",
                    if params.is_empty() {
                        String::new()
                    } else {
                        format!(" {params}")
                    }
                );
                if text != node.text {
                    validate_interpolation(&text, node.children.is_some())
                        .map_err(|e| error(&node, "EU_FUNCTION", e.message))?;
                    node.text = text;
                }
                let args = arguments(&params).map_err(|e| error(&node, &e.code, e.message))?;
                if self.config.migration_beta6 {
                    crate::migration::legacy6::directive(
                        &node,
                        &name,
                        &args,
                        ctx.responsive.as_deref(),
                        self.config,
                    );
                }
                if self.config.migration_beta11 {
                    crate::migration::legacy11::directive(&node, &name, &args, self.config);
                }
                match name.as_str() {
                    "europa" => {
                        arity(&node, &args, 1, 1)?;
                        if ctx.style || node.children.is_some() {
                            return Err(error(&node, "EU_CONTEXT", "@europa must be a statement at root or inside a layer/conditional group"));
                        }
                        let sources: &[&str] = match args[0] {
                            "base" => &[
                                include_str!("../assets/normalize.css"),
                                include_str!("../assets/base.css"),
                            ],
                            "arrows" => &[include_str!("../assets/arrows.css")],
                            _ => {
                                return Err(error(
                                    &node,
                                    "EU_ARGUMENTS",
                                    "Unknown Europa bundle; expected base or arrows",
                                ))
                            }
                        };
                        fn origin(nodes: &mut [Node], offset: usize) {
                            for node in nodes {
                                node.offset = offset;
                                if let Some(children) = &mut node.children {
                                    origin(children, offset);
                                }
                            }
                        }
                        for source in sources {
                            let mut nodes = crate::parser::parse(source)
                                .map_err(|e| error(&node, &e.code, e.message))?;
                            origin(&mut nodes, node.offset);
                            result.extend(self.nodes(nodes, ctx, depth + 1)?);
                        }
                    }
                    "iterate" => {
                        arity(&node, &args, 1, 1)?;
                        if !ctx.style {
                            return Err(error(
                                &node,
                                "EU_CONTEXT",
                                "@iterate must be inside a style rule",
                            ));
                        }
                        let children = node.children.as_ref().ok_or_else(|| {
                            error(&node, "EU_ARGUMENTS", "@iterate requires a block")
                        })?;
                        let values = lookup(self.config.value, args[0]).ok_or_else(|| {
                            error(
                                &node,
                                "EU_CONFIG",
                                format!("Unknown iterable `{}`", args[0]),
                            )
                        })?;
                        let entries: Box<dyn Iterator<Item = (String, &Value)>> = match values {
                            Value::Object(values) => {
                                Box::new(values.iter().map(|(k, v)| (k.clone(), v)))
                            }
                            Value::Array(values) => {
                                Box::new(values.iter().enumerate().map(|(i, v)| (i.to_string(), v)))
                            }
                            _ => {
                                return Err(error(
                                    &node,
                                    "EU_ITERATE",
                                    "@iterate requires an object or array",
                                ))
                            }
                        };
                        for (key, value) in entries {
                            self.visit(&node)?;
                            let value =
                                scalar(value).or_else(|| value.as_bool().map(|v| v.to_string()));
                            let child_ctx = Context {
                                iteration: Some((key, value)),
                                ..ctx.clone()
                            };
                            result.extend(self.nodes(children.clone(), &child_ctx, depth + 1)?);
                        }
                    }
                    "unpack" => {
                        self.statement(&node, ctx)?;
                        arity(&node, &args, 1, 1)?;
                        let generated = self.unpack(&node, args[0])?;
                        // Interpolation has already happened at the use site; config values
                        // must not accidentally acquire bindings from a surrounding iterator.
                        let child_ctx = Context {
                            iteration: None,
                            ..ctx.clone()
                        };
                        result.extend(self.nodes(generated, &child_ctx, depth + 1)?);
                    }
                    "responsive" | "mq" => {
                        arity(&node, &args, 1, 1)?;
                        let media = self.config.media(args[0], node.offset)?;
                        let children = node.children.clone().ok_or_else(|| {
                            error(&node, "EU_ARGUMENTS", "@responsive requires a block")
                        })?;
                        let child_ctx = Context {
                            responsive: Some(args[0].into()),
                            ..ctx.clone()
                        };
                        let children = self.nodes(children, &child_ctx, depth + 1)?;
                        result.push(Node::block(
                            format!("@media {media}"),
                            children,
                            node.offset,
                        ));
                    }
                    "if" => {
                        arity(&node, &args, 1, 1)?;
                        let value = lookup(self.config.value, args[0]).ok_or_else(|| {
                            error(
                                &node,
                                "EU_CONFIG",
                                format!("Unknown config key `{}`", args[0]),
                            )
                        })?;
                        let children = node
                            .children
                            .clone()
                            .ok_or_else(|| error(&node, "EU_ARGUMENTS", "@if requires a block"))?;
                        let truthy = match value {
                            Value::Null => false,
                            Value::Bool(v) => *v,
                            Value::Number(v) => v.as_f64() != Some(0.0),
                            Value::String(v) => !v.is_empty(),
                            _ => true,
                        };
                        if truthy {
                            result.extend(self.nodes(children, ctx, depth + 1)?);
                        }
                    }
                    "extend" => {
                        self.statement(&node, ctx)?;
                        let names = crate::parser::split_top_level(&params, ',')
                            .map_err(|e| error(&node, "EU_EXTEND", e.message))?;
                        for name in names {
                            let parts = arguments(name)
                                .map_err(|e| error(&node, "EU_EXTEND", e.message))?;
                            if parts.len() != 1 {
                                return Err(error(
                                    &node,
                                    "EU_EXTEND",
                                    "Expected a comma-separated list of %placeholders",
                                ));
                            }
                            let name = parts[0];
                            if !placeholder(name) {
                                return Err(error(
                                &node,
                                "EU_EXTEND",
                                "@extend supports named %placeholders only; move shared declarations into a %placeholder and extend it from both selectors, then review cascade order",
                            ));
                            }
                            if self.expanding.iter().any(|s| s == name) {
                                return Err(error(
                                    &node,
                                    "EU_EXTEND",
                                    format!(
                                        "Cyclic placeholder expansion: {} -> {}",
                                        self.expanding.join(" -> "),
                                        name
                                    ),
                                ));
                            }
                            let children =
                                self.placeholders.get(name).cloned().ok_or_else(|| {
                                    error(
                                        &node,
                                        "EU_EXTEND",
                                        format!("Unknown placeholder `{}`", name),
                                    )
                                })?;
                            self.expanding.push(name.into());
                            result.extend(self.nodes(children, ctx, depth + 1)?);
                            self.expanding.pop();
                        }
                    }
                    "color" | "color!" | "display" | "order" | "font" | "fontsize" | "space"
                    | "space!" | "column-offset" | "abs100" | "abs100!" | "embed-responsive"
                    | "grid" | "column" => {
                        self.statement(&node, ctx)?;
                        let mut generated = self.directive(&node, &name, &args, ctx)?;
                        result.append(&mut generated);
                    }
                    "nest" => {
                        return Err(error(
                            &node,
                            "EU_LEGACY_NEST",
                            "Replace legacy @nest with a native nested selector",
                        ))
                    }
                    "import" => {
                        if depth != 0
                            || node.children.is_some()
                            || !crate::imports::external_import(&params, node.offset)?
                        {
                            return Err(error(&node, "EU_IMPORT", "Local @imports require compile_file; external @imports must be root statements"));
                        }
                        result.push(node);
                        continue;
                    }
                    "row" => {
                        return Err(error(
                            &node,
                            "EU_DEPRECATED",
                            "@row is deprecated; use @display flex/row/wrap and @space gap 1",
                        ))
                    }
                    "at-root" => {
                        return Err(error(
                            &node,
                            "EU_UNSUPPORTED",
                            format!("@{name} is not implemented in the experimental compiler yet"),
                        ));
                    }
                    _ => {
                        if name.ends_with('!') {
                            return Err(error(
                                &node,
                                "EU_UNSUPPORTED",
                                format!("Unsupported important directive @{name}"),
                            ));
                        }
                        if let Some(children) = node.children.take() {
                            let child_ctx = Context {
                                style: ctx.style
                                    || matches!(
                                        name.as_str(),
                                        "font-face"
                                            | "page"
                                            | "property"
                                            | "counter-style"
                                            | "font-palette-values"
                                            | "font-feature-values"
                                            | "position-try"
                                            | "view-transition"
                                            | "color-profile"
                                    ),
                                ..ctx.clone()
                            };
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
                if let Some(offset) = suffix_offset(&node.text)?.filter(|_| !self.migration) {
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
                let sizes = crate::size::Sizes {
                    config: self.config,
                    offset: node.offset,
                };
                match sizes.css(&value, None, false) {
                    Ok(value) => vec![decl(property, &value, node, false)],
                    Err(e) if e.code == "EU_SIZE_CONTEXT" => {
                        for index in self.config.select(query, node.offset)? {
                            let value = sizes.css(&value, Some(index), false)?;
                            result.push(Node::block(
                                format!(
                                    "@media {}",
                                    self.config.media_indices(&[index], node.offset)
                                ),
                                vec![decl(property, &value, node, false)],
                                node.offset,
                            ));
                        }
                        continue;
                    }
                    Err(e) => return Err(e),
                }
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
            "grid" => {
                arity(node, args, 0, 0)?;
                let mut nodes = vec![
                    decl("display", "grid", node, false),
                    decl("grid-template-columns", "repeat(12, 1fr)", node, false),
                ];
                nodes.extend(self.spacing(node, &["grid-column-gap", "1"], ctx, false)?);
                Ok(nodes)
            }
            "column" => {
                arity(node, args, 1, 2)?;
                if args[0].contains('@') {
                    return Err(error(
                        node,
                        "EU_ARGUMENTS",
                        "Replace size@breakpoint with size breakpoint",
                    ));
                }
                let sizes = crate::size::Sizes {
                    config: self.config,
                    offset: node.offset,
                };
                self.size_rules(node, args.get(1).copied(), ctx, |index| {
                    let value = sizes.spacing(args[0], index)?;
                    let mut has_vw = false;
                    crate::parser::rewrite_value(&value, &mut |word, args| {
                        if args.is_none()
                            && crate::size::dimension(word).is_some_and(|(_, unit)| unit == "vw")
                        {
                            has_vw = true;
                        }
                        Ok(None)
                    })?;
                    let max = if has_vw {
                        format!("calc({value} - 0.002vw)")
                    } else {
                        value.clone()
                    };
                    Ok(vec![
                        decl("position", "relative", node, false),
                        decl("flex-grow", "0", node, false),
                        decl("flex-shrink", "0", node, false),
                        decl("flex-basis", &value, node, false),
                        decl("max-width", &max, node, false),
                    ])
                })
            }
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
        if !font {
            return self.spacing(node, args, ctx, important);
        }
        arity(node, args, 1, 2)?;
        if args.len() > 1 && ctx.responsive.is_some() {
            return Err(error(
                node,
                "EU_RESPONSIVE",
                "A directive inside @responsive cannot have its own breakpoint query",
            ));
        }
        let (name, multiplier, line_height) = self.font_query(node, args[0])?;
        let modified = args[0]
            .strip_prefix(&name)
            .is_some_and(|suffix| suffix.starts_with('('));
        let token = self.config.get("/theme/typography/sizes", &name);
        if token.is_none() && ctx.responsive.is_some() {
            self.config.beta11_warning(node.offset, || "Literal font sizes inside @responsive were emitted as breakpoint-specific groups in beta.11; native conditions retain their enclosing range, with contiguous named breakpoint boundaries".into());
            self.config.beta6_warning(node.offset, || "Literal font sizes inside @responsive were emitted as breakpoint-specific groups in beta.6; native conditions retain their enclosing range, with contiguous named breakpoint boundaries".into());
        }
        let sizes = crate::size::Sizes {
            config: self.config,
            offset: node.offset,
        };
        let mut result = Vec::new();
        if let Some(base) = token.and_then(|v| v.get("__base__")) {
            self.config.beta6_warning(node.offset, || format!("Typography `{name}` now applies __base__ properties; beta.6 did not apply those shared properties"));
            if !base.is_object() {
                return Err(error(
                    node,
                    "EU_CONFIG",
                    "Typography __base__ must be a property object",
                ));
            }
            // Keep shared properties at the use site before the breakpoint overrides.
            result.extend(self.size_rules(node, None, ctx, |index| {
                self.font_properties(node, base, index, 1.0, None, false)
            })?);
        }
        result.extend(self.size_rules(node, args.get(1).copied(), ctx, |index| {
            let value = token.map(|v| sizes.at(v, index)).transpose()?;
            match value {
                Some(value) => self.font_properties(
                    node,
                    value,
                    index,
                    multiplier,
                    line_height.as_deref(),
                    modified,
                ),
                None => self.font_properties(
                    node,
                    &Value::String(name.clone()),
                    index,
                    multiplier,
                    line_height.as_deref(),
                    modified,
                ),
            }
        })?);
        if token.is_some() {
            fn annotate(nodes: &mut [Node], name: &str) {
                for node in nodes {
                    if let Some(children) = &mut node.children {
                        annotate(children, name);
                    } else if node.text.starts_with("font-size:") {
                        node.origin_name = Some(format!("typography.sizes.{name}"));
                    }
                }
            }
            annotate(&mut result, &name);
        }
        Ok(result)
    }

    fn font_query(&self, node: &Node, value: &str) -> Result<(String, f64, Option<String>), Error> {
        if self.config.get("/theme/typography/sizes", value).is_some() {
            return Ok((value.into(), 1.0, None));
        }
        let parts = crate::parser::split_top_level(value, '/')
            .map_err(|e| error(node, "EU_SIZE", e.message))?;
        let modifier_only = value
            .strip_suffix(')')
            .and_then(|v| v.rsplit_once('('))
            .is_some_and(|(key, _)| {
                self.config.get("/theme/typography/sizes", key).is_some()
                    || crate::size::dimension(key).is_some()
            });
        let (name, line) = if parts.len() > 1 && !modifier_only {
            (
                parts[..parts.len() - 1].join("/"),
                Some(parts.last().unwrap().to_string()),
            )
        } else {
            (value.to_string(), None)
        };
        if line.as_ref().is_some_and(|v| v.is_empty()) {
            return Err(error(node, "EU_SIZE", "Missing line height after /"));
        }
        if let Some((key, factor)) = name.strip_suffix(')').and_then(|s| s.rsplit_once('(')) {
            if self.config.get("/theme/typography/sizes", key).is_some()
                || crate::size::dimension(key).is_some()
            {
                let factor = factor
                    .parse::<f64>()
                    .ok()
                    .filter(|n| n.is_finite() && *n > 0.0)
                    .ok_or_else(|| {
                        error(
                            node,
                            "EU_SIZE",
                            "Font size modifier must be a positive number",
                        )
                    })?;
                return Ok((key.into(), factor, line));
            }
        }
        Ok((name, 1.0, line))
    }

    fn font_properties(
        &self,
        node: &Node,
        value: &Value,
        index: Option<usize>,
        multiplier: f64,
        line_height: Option<&str>,
        modified: bool,
    ) -> Result<Vec<Node>, Error> {
        let sizes = crate::size::Sizes {
            config: self.config,
            offset: node.offset,
        };
        let mut result = Vec::new();
        if let Some(properties) = value.as_object() {
            if self.migration && !modified {
                if let Some(height) = line_height {
                    let old = properties.get("line-height").and_then(scalar);
                    let resolved = self.line_height(node, height, index)?;
                    if old.as_deref() != Some(resolved.as_str()) {
                        self.config.migration_warning(node.offset, || format!("At `{}`, explicit line-height `/{height}` now overrides the object font style's {}; the legacy unmodified object path ignored this suffix. Remove the suffix to retain the configured/inherited line-height, or accept the explicit override.", index.map(|i| self.config.breakpoints[i].0.as_str()).unwrap_or("all widths"), old.map(|v| format!("`{v}`")).unwrap_or_else(|| "inherited line-height".into())));
                    }
                }
            }
            if self.migration && modified {
                let retained: Vec<_> = properties
                    .keys()
                    .filter(|key| {
                        key.as_str() != "font-size"
                            && !(key.as_str() == "line-height" && line_height.is_some())
                    })
                    .collect();
                if !retained.is_empty() {
                    self.config.migration_warning(node.offset, || format!("At `{}`, multiplying this object-based font size by {multiplier} now retains properties {:?}; the legacy modifier returned only font-size and an explicit line-height suffix", index.map(|i| self.config.breakpoints[i].0.as_str()).unwrap_or("all widths"), retained));
                }
            }
            for (property, value) in properties {
                let raw = css_value(value, property, node)?;
                let value = if property == "font-size" {
                    sizes.css(
                        &crate::size::scale(&raw, multiplier, node.offset)?,
                        index,
                        true,
                    )?
                } else if crate::size::dimension(&raw)
                    .is_some_and(|(_, unit)| matches!(unit, "vw" | "dpx"))
                {
                    sizes.css(&raw, index, true)?
                } else {
                    raw
                };
                let declaration = decl(property, &value, node, false);
                if property.trim_start().starts_with('@') {
                    return Err(error(
                        node,
                        "EU_CONFIG",
                        "Typography entries must be CSS properties",
                    ));
                }
                validate_interpolation(&declaration.text, false)
                    .map_err(|e| error(node, "EU_CONFIG", e.message))?;
                result.push(declaration);
            }
        } else {
            let raw = scalar(value).ok_or_else(|| {
                error(
                    node,
                    "EU_CONFIG",
                    "Font sizes must be CSS values or property objects",
                )
            })?;
            let parts = crate::parser::split_top_level(&raw, '/')
                .map_err(|e| error(node, "EU_SIZE", e.message))?;
            if parts.len() > 2 {
                return Err(error(
                    node,
                    "EU_SIZE",
                    "Font size values accept one line-height suffix",
                ));
            }
            let height = line_height.or_else(|| parts.get(1).copied());
            if parts[0].ends_with("dpx") && height.is_some_and(|v| v.ends_with("vw")) {
                return Err(error(
                    node,
                    "EU_SIZE",
                    "Do not mix dpx font sizes with vw line heights",
                ));
            }
            let raw = crate::size::scale(parts[0], multiplier, node.offset)?;
            result.push(decl(
                "font-size",
                &sizes.css(&raw, index, true)?,
                node,
                false,
            ));
            if let Some(height) = height {
                result.push(decl(
                    "line-height",
                    &self.line_height(node, height, index)?,
                    node,
                    false,
                ));
            }
            return Ok(result);
        }
        if let Some(height) = line_height {
            result.push(decl(
                "line-height",
                &self.line_height(node, height, index)?,
                node,
                false,
            ));
        }
        Ok(result)
    }

    fn line_height(&self, node: &Node, value: &str, index: Option<usize>) -> Result<String, Error> {
        if crate::size::dimension(value).is_some_and(|(n, unit)| n >= 0.0 && unit.is_empty()) {
            return Ok(value.into());
        }
        crate::size::Sizes {
            config: self.config,
            offset: node.offset,
        }
        .css(value, index, true)
    }

    fn size_rules(
        &self,
        node: &Node,
        query: Option<&str>,
        ctx: &Context,
        mut render: impl FnMut(Option<usize>) -> Result<Vec<Node>, Error>,
    ) -> Result<Vec<Node>, Error> {
        if query.is_some() && ctx.responsive.is_some() {
            return Err(error(
                node,
                "EU_RESPONSIVE",
                "A directive inside @responsive cannot have its own breakpoint query",
            ));
        }
        match render(None) {
            Ok(nodes) => return self.wrap(node, nodes, query, ctx),
            Err(e) if e.code == "EU_SIZE_CONTEXT" => {}
            Err(e) => return Err(e),
        }
        if self.config.breakpoints.is_empty() {
            return Err(error(
                node,
                "EU_CONFIG",
                "Responsive sizes require configured breakpoints",
            ));
        }
        let scope = query.or(ctx.responsive.as_deref());
        let arrow = scope.is_some_and(|q| q.contains("->"));
        let indices = match scope {
            Some(q) if !arrow => self.config.select(q, node.offset)?,
            _ => (0..self.config.breakpoints.len()).collect(),
        };
        let mut result = Vec::new();
        for index in &indices {
            let nodes = render(Some(*index))?;
            if ctx.responsive.is_some() && indices.len() == 1 && !arrow {
                result.extend(nodes);
            } else {
                result.push(Node::block(
                    format!(
                        "@media {}",
                        self.config.media_indices(&[*index], node.offset)
                    ),
                    nodes,
                    node.offset,
                ));
            }
        }
        if arrow && query.is_some() {
            self.wrap(node, result, query, ctx)
        } else {
            Ok(result)
        }
    }

    fn spacing(
        &self,
        node: &Node,
        args: &[&str],
        ctx: &Context,
        important: bool,
    ) -> Result<Vec<Node>, Error> {
        arity(node, args, 1, 3)?;
        let prop = args[0];
        if prop == "breakout" {
            arity(node, args, 1, 2)?;
            return self.wrap(
                node,
                vec![
                    decl("width", "100vw", node, important),
                    decl("margin-left", "calc(50% - 50vw)", node, important),
                ],
                args.get(1).copied(),
                ctx,
            );
        }
        let sizes = crate::size::Sizes {
            config: self.config,
            offset: node.offset,
        };
        if let Some(inner) = prop
            .strip_prefix("negate(")
            .and_then(|s| s.strip_suffix(')'))
        {
            arity(node, args, 1, 2)?;
            let params = crate::parser::split_top_level(inner, ',')
                .map_err(|e| error(node, "EU_ARGUMENTS", e.message))?;
            if params.len() != 2 || params.iter().any(|s| s.is_empty()) {
                return Err(error(
                    node,
                    "EU_ARGUMENTS",
                    "negate() expects a current gap and desired gap",
                ));
            }
            return self.size_rules(node, args.get(1).copied(), ctx, |index| {
                let value = sizes.negate(inner, index)?;
                Ok(vec![decl("margin-top", &value, node, important)])
            });
        }
        if prop == "container" {
            arity(node, args, 1, 2)?;
            return self.size_rules(node, args.get(1).copied(), ctx, |index| {
                Ok(sizes
                    .container(index)?
                    .iter()
                    .map(|(p, v)| decl(p, v, node, important))
                    .collect())
            });
        }
        arity(node, args, 2, 3)?;
        let props = match prop {
            "padding-x" => vec!["padding-left", "padding-right"],
            "padding-y" => vec!["padding-top", "padding-bottom"],
            "margin-x" => vec!["margin-left", "margin-right"],
            "margin-y" => vec!["margin-top", "margin-bottom"],
            _ => vec![prop],
        };
        if !prop.starts_with(|c: char| c.is_alphabetic() || matches!(c, '-' | '_'))
            || !prop
                .chars()
                .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_'))
        {
            return Err(error(node, "EU_ARGUMENTS", "Invalid CSS property"));
        }
        self.size_rules(node, args.get(2).copied(), ctx, |index| {
            let value = sizes.spacing(args[1], index)?;
            if matches!(prop, "translateX" | "translateY" | "translateZ" | "scale") {
                Ok(vec![decl(
                    "transform",
                    &format!("{prop}({value})"),
                    node,
                    important,
                )])
            } else {
                Ok(props
                    .iter()
                    .map(|p| decl(p, &value, node, important))
                    .collect())
            }
        })
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
