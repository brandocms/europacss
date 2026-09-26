//! Shared sizing primitives, ported incrementally from parseSize.js.
use crate::{
    config::{scalar, Config},
    parser::{arguments, rewrite_value, split_top_level},
    Error,
};
use serde_json::Value;

/// Design pixels use a reference viewport and retain Europa's zoom variable.
pub fn design_pixels(
    value: &str,
    config: &Config<'_>,
    index: usize,
    offset: usize,
) -> Result<String, Error> {
    let error = |message| Error::new("EU_SIZE", message, offset);
    let number = value
        .strip_suffix("dpx")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|n| n.is_finite())
        .ok_or_else(|| error(format!("Invalid design-pixel value `{value}`")))?;
    let breakpoint = &config.breakpoints[index].0;
    let widths = config
        .value
        .get("dpxViewportSizes")
        .map(|value| {
            value
                .as_object()
                .ok_or_else(|| error("dpxViewportSizes must be an object".into()))
        })
        .transpose()?;
    let mut reference = widths.and_then(|widths| widths.get(breakpoint));
    if reference.is_none() {
        if let (Some(widths), Some(collections)) = (
            widths,
            config
                .value
                .pointer("/theme/breakpointCollections")
                .and_then(Value::as_object),
        ) {
            for name in collections.keys() {
                if let Some(width) = widths.get(name) {
                    if config.select(name, offset)?.contains(&index) {
                        reference = Some(width);
                        break;
                    }
                }
            }
        }
    }
    let reference = reference.or_else(|| config.value.get("dpxViewportSize"));
    let reference = match reference {
        None => 1440.0,
        Some(value) => scalar(value)
            .and_then(|v| v.parse::<f64>().ok())
            .filter(|n| n.is_finite() && *n > 0.0)
            .ok_or_else(|| {
                error(format!(
                    "Reference viewport for `{breakpoint}` must be a positive number"
                ))
            })?,
    };
    let vw = number / reference * 100.0;
    if !vw.is_finite() {
        return Err(error("Design-pixel conversion overflowed".into()));
    }
    // Match the legacy five-decimal vw conversion before applying a maximum.
    let vw: f64 = format!("{vw:.5}").parse().unwrap();
    viewport(vw, config, index, offset, true)
}

fn viewport(
    vw: f64,
    config: &Config<'_>,
    index: usize,
    offset: usize,
    zoom: bool,
) -> Result<String, Error> {
    let error = |message| Error::new("EU_SIZE", message, offset);
    let breakpoint = &config.breakpoints[index].0;
    if config.value.get("setMaxForVw").and_then(Value::as_bool) == Some(true)
        && index + 1 == config.breakpoints.len()
    {
        let maximum = config
            .get("/theme/container/maxWidth", breakpoint)
            .and_then(scalar)
            .ok_or_else(|| {
                error(format!(
                    "setMaxForVw requires a container maxWidth for `{breakpoint}`"
                ))
            })?;
        let end = maximum
            .trim_end_matches(|c: char| c.is_ascii_alphabetic())
            .len();
        let unit = &maximum[end..];
        let maximum = maximum[..end].parse::<f64>().ok()
            .filter(|n| n.is_finite() && *n > 0.0)
            .filter(|_| matches!(unit, "px" | "rem" | "em" | "ch" | "ex" | "lh" | "rlh" | "cm" | "mm" | "in" | "pt" | "pc"))
            .ok_or_else(|| error("setMaxForVw requires a positive container length, not a percentage or viewport unit".into()))?;
        let capped = maximum / 100.0 * vw;
        if !capped.is_finite() {
            return Err(error("Design-pixel maximum overflowed".into()));
        }
        return Ok(format!("{capped}{unit}"));
    }
    Ok(if zoom {
        format!("calc({vw}vw * var(--ec-zoom))")
    } else {
        format!("{vw}vw")
    })
}

/// Parse a finite CSS number and optional dimension without guessing from substrings.
pub fn dimension(value: &str) -> Option<(f64, &str)> {
    let bytes = value.as_bytes();
    let mut end = usize::from(matches!(bytes.first(), Some(b'+' | b'-')));
    let first = end;
    while bytes.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    if bytes.get(end) == Some(&b'.') {
        end += 1;
        while bytes.get(end).is_some_and(u8::is_ascii_digit) {
            end += 1;
        }
    }
    if end == first || &value[first..end] == "." {
        return None;
    }
    if matches!(bytes.get(end), Some(b'e' | b'E')) {
        let mut exponent = end + 1;
        if matches!(bytes.get(exponent), Some(b'+' | b'-')) {
            exponent += 1;
        }
        let digits = exponent;
        while bytes.get(exponent).is_some_and(u8::is_ascii_digit) {
            exponent += 1;
        }
        if exponent > digits {
            end = exponent;
        }
    }
    let unit = &value[end..];
    if !unit.bytes().all(|c| c.is_ascii_alphabetic() || c == b'%') {
        return None;
    }
    let number = value[..end].parse::<f64>().ok()?;
    number.is_finite().then_some((number, unit))
}

pub fn scale(value: &str, factor: f64, offset: usize) -> Result<String, Error> {
    if !factor.is_finite() {
        return Err(Error::new(
            "EU_SIZE",
            "Size multiplier must be finite",
            offset,
        ));
    }
    if let Some((number, unit)) = dimension(value) {
        let product = number * factor;
        if !product.is_finite() {
            return Err(Error::new(
                "EU_SIZE",
                "Size multiplication overflowed",
                offset,
            ));
        }
        return Ok(format!("{product}{unit}"));
    }
    Ok(if factor == 1.0 {
        value.into()
    } else {
        format!("calc({value} * {factor})")
    })
}

pub struct Sizes<'a, 'b> {
    pub config: &'a Config<'b>,
    pub offset: usize,
}

impl Sizes<'_, '_> {
    fn gap_inner(&self, value: &str, index: Option<usize>, depth: usize) -> Result<String, Error> {
        let initial = match self.spacing_inner(value.trim(), index, depth) {
            Ok(value) => return Ok(value),
            Err(e) if e.code == "EU_SIZE_CONTEXT" => return Err(e),
            Err(error) => error,
        };
        for op in ['+', '-'] {
            let parts = split_top_level(value, op).map_err(|e| self.error(e.message))?;
            if parts.len() > 1 && parts.iter().all(|p| !p.is_empty()) {
                let values = parts
                    .into_iter()
                    .map(|p| self.spacing_inner(p.trim(), index, depth + 1))
                    .collect::<Result<Vec<_>, _>>()?;
                return Ok(format!("calc({})", values.join(&format!(" {op} "))));
            }
        }
        Err(initial)
    }
    /// Negate the resolved width, or subtract the current gap from a desired gap.
    pub fn negate(&self, args: &str, index: Option<usize>) -> Result<String, Error> {
        self.negate_inner(args, index, 0)
    }
    fn negate_inner(
        &self,
        args: &str,
        index: Option<usize>,
        depth: usize,
    ) -> Result<String, Error> {
        self.config.beta6_warning(self.offset, || "negate() sizing was added after beta.6; review its newly generated margin or size calculation".into());
        self.config.beta11_warning(self.offset, || "negate() sizing was added after beta.11; review its newly generated margin or size calculation".into());
        let params = split_top_level(args, ',').map_err(|e| self.error(e.message))?;
        if !(1..=2).contains(&params.len()) || params.iter().any(|s| s.is_empty()) {
            return Err(self.error("negate() expects a value and an optional desired gap"));
        }
        let current = self.spacing_inner(params[0].trim(), index, depth + 1)?;
        let numeric = |value: &str| dimension(value).is_some() || value.contains('(');
        if !numeric(&current) {
            return Err(self.error("negate() requires a numeric size, not a CSS keyword"));
        }
        if params.len() == 1 {
            scale(&current, -1.0, self.offset)
        } else {
            let desired = self.gap_inner(params[1].trim(), index, depth + 1)?;
            if !numeric(&desired) {
                return Err(self.error("negate() requires a numeric desired gap"));
            }
            Ok(format!("calc({desired} - {current})"))
        }
    }
    fn error(&self, message: impl Into<String>) -> Error {
        Error::new("EU_SIZE", message, self.offset)
    }
    fn index(&self, index: Option<usize>) -> Result<usize, Error> {
        index.ok_or_else(|| {
            Error::new(
                "EU_SIZE_CONTEXT",
                "This size requires a named breakpoint",
                self.offset,
            )
        })
    }
    pub fn at<'v>(&self, value: &'v Value, index: Option<usize>) -> Result<&'v Value, Error> {
        if let Some(values) = value.as_object() {
            let key = &self.config.breakpoints[self.index(index)?].0;
            values
                .get(key)
                .or_else(|| values.get("*"))
                .ok_or_else(|| self.error(format!("Size has no value for breakpoint `{key}`")))
        } else {
            Ok(value)
        }
    }
    fn config_size(&self, path: &str, index: Option<usize>) -> Result<String, Error> {
        let value = self
            .config
            .value
            .pointer(path)
            .ok_or_else(|| self.error(format!("Missing config `{path}`")))?;
        scalar(self.at(value, index)?)
            .ok_or_else(|| self.error(format!("Expected a size in `{path}`")))
    }
    pub fn spacing(&self, value: &str, index: Option<usize>) -> Result<String, Error> {
        self.spacing_inner(value.trim(), index, 0)
    }
    fn spacing_inner(
        &self,
        value: &str,
        index: Option<usize>,
        depth: usize,
    ) -> Result<String, Error> {
        if depth > 64 {
            return Err(self.error("Cyclic or excessively nested size expression"));
        }
        if self.config.migration_beta6 {
            let old = self
                .config
                .value
                .pointer("/theme/spacing")
                .and_then(|v| v.get(value));
            let new = self.config.get("/theme/spacing", value);
            if old != new {
                self.config.beta6_warning(self.offset, || format!("Spacing token `{value}` resolves differently from beta.6's direct spacing-key lookup; review nested or dotted token names"));
            }
            if matches!(value, "container/2" | "-container/2") {
                let padding = self.config_size("/theme/container/padding", index)?;
                if padding.starts_with("calc(") {
                    self.config.beta6_warning(self.offset, || format!("`{value}` now divides the whole container padding `{padding}` by two; beta.6 divided only the final term of the outer calc() expression"));
                }
            }
        }
        if self.config.migration_beta11 {
            let old = self
                .config
                .value
                .pointer("/theme/spacing")
                .and_then(|v| v.get(value));
            if old != self.config.get("/theme/spacing", value) {
                self.config.beta11_warning(self.offset, || format!("Spacing token `{value}` resolves differently from beta.11's direct spacing-key lookup; review nested or dotted token names"));
            }
        }
        if let Some(token) = self.config.get("/theme/spacing", value) {
            let token = scalar(self.at(token, index)?)
                .ok_or_else(|| self.error("Spacing tokens must contain CSS sizes"))?;
            return self.spacing_inner(&token, index, depth + 1);
        }
        if value == "container" {
            return self.container_padding(index, depth + 1);
        }
        if let Some(rest) = value.strip_prefix('-') {
            if dimension(value).is_none() {
                // Fractions encode a signed column count plus gutter arithmetic.
                // Keep the legacy negative-offset formula; negating the whole
                // positive width would reverse its gutter adjustment as well.
                let parts = split_top_level(value, '/').map_err(|e| self.error(e.message))?;
                if parts.len() == 2
                    && parts[0]
                        .split(':')
                        .next()
                        .and_then(|n| n.parse::<f64>().ok())
                        .is_some()
                {
                    return self.fraction(parts[0], parts[1], index, depth + 1);
                }
                return scale(
                    &self.spacing_inner(rest, index, depth + 1)?,
                    -1.0,
                    self.offset,
                );
            }
        }
        for op in ['*', '/'] {
            let parts = split_top_level(value, op).map_err(|e| self.error(e.message))?;
            if parts.len() == 2 {
                if op == '/'
                    && parts[0]
                        .split(':')
                        .next()
                        .and_then(|v| v.parse::<f64>().ok())
                        .is_some()
                {
                    return self.fraction(parts[0], parts[1], index, depth + 1);
                }
                let factor = parts[1]
                    .parse::<f64>()
                    .ok()
                    .filter(|n| n.is_finite() && (op != '/' || *n != 0.0))
                    .ok_or_else(|| {
                        self.error(
                            "Size arithmetic requires a finite multiplier or nonzero divisor",
                        )
                    })?;
                let value = self.spacing_inner(parts[0], index, depth + 1)?;
                return scale(
                    &value,
                    if op == '/' { 1.0 / factor } else { factor },
                    self.offset,
                );
            }
            if parts.len() > 2 {
                return Err(self.error("Use calc() for compound size arithmetic"));
            }
        }
        if let Some((number, "")) = dimension(value) {
            if number == 0.0 {
                return Ok("0".into());
            }
            let gutter = self.config_size("/theme/columns/gutters", index)?;
            // Multiply before conversion to avoid compounding dpx rounding.
            return self.css_inner(
                &scale(&gutter, number, self.offset)?,
                index,
                false,
                depth + 1,
            );
        }
        self.css_inner(value, index, false, depth + 1)
    }
    pub fn css(&self, value: &str, index: Option<usize>, zoom: bool) -> Result<String, Error> {
        self.css_inner(value, index, zoom, 0)
    }
    fn css_inner(
        &self,
        value: &str,
        index: Option<usize>,
        zoom: bool,
        depth: usize,
    ) -> Result<String, Error> {
        if depth > 64 {
            return Err(self.error("Cyclic or excessively nested size expression"));
        }
        if let Some((number, unit)) = dimension(value) {
            return match unit {
                "dpx" => design_pixels(value, self.config, self.index(index)?, self.offset),
                "vw" => {
                    if self
                        .config
                        .value
                        .get("setMaxForVw")
                        .and_then(Value::as_bool)
                        == Some(true)
                    {
                        viewport(number, self.config, self.index(index)?, self.offset, zoom)
                    } else {
                        Ok(if zoom {
                            format!("calc({value} * var(--ec-zoom))")
                        } else {
                            value.into()
                        })
                    }
                }
                "" if number != 0.0 => Err(self.error("A CSS length needs a unit")),
                "" | "px" | "rem" | "em" | "%" | "vh" | "vmin" | "vmax" | "svh" | "lvh" | "dvh"
                | "svw" | "lvw" | "dvw" | "ch" | "ex" | "lh" | "rlh" | "cm" | "mm" | "in"
                | "pt" | "pc" | "cqw" | "cqh" | "cqi" | "cqb" | "cqmin" | "cqmax" => {
                    Ok(value.into())
                }
                _ => Err(self.error(format!("Unknown size unit `{unit}`"))),
            };
        }
        if matches!(
            value,
            "auto"
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
            return Ok(value.into());
        }
        if ![
            "var(",
            "calc(",
            "min(",
            "max(",
            "clamp(",
            "env(",
            "fit-content(",
            "between(",
            "vertical-rhythm(",
            "negate(",
        ]
        .iter()
        .any(|name| value.starts_with(name))
        {
            return Err(self.error(format!("Unknown size expression `{value}`")));
        }
        rewrite_value(value, &mut |name, args| {
            if let Some(args) = args {
                match name {
                    "var[]" => return self.spacing_inner(args.trim(), index, depth + 1).map(Some),
                    "negate" => return self.negate_inner(args, index, depth + 1).map(Some),
                    "between" => return self.between(args, index, zoom).map(Some),
                    "vertical-rhythm" => return self.rhythm(args, index, depth + 1).map(Some),
                    _ => {}
                }
            } else if dimension(name).is_some_and(|(_, unit)| unit == "dpx") {
                return design_pixels(name, self.config, self.index(index)?, self.offset).map(Some);
            }
            Ok(None)
        })
        .map_err(|e| {
            if e.code == "EU_PARSE" {
                self.error(e.message)
            } else {
                e
            }
        })
    }
    fn fraction(
        &self,
        numerator: &str,
        denominator: &str,
        index: Option<usize>,
        depth: usize,
    ) -> Result<String, Error> {
        let parse = |part: &str| -> Result<(f64, Option<f64>), Error> {
            let mut parts = part.split(':');
            let number = parts
                .next()
                .unwrap()
                .parse::<f64>()
                .ok()
                .filter(|n| n.is_finite())
                .ok_or_else(|| self.error("Invalid column count"))?;
            let gutter = parts
                .next()
                .map(|v| {
                    v.parse::<f64>()
                        .ok()
                        .filter(|n| n.is_finite())
                        .ok_or_else(|| self.error("Invalid gutter modifier"))
                })
                .transpose()?;
            if parts.next().is_some() {
                return Err(self.error("Invalid column fraction"));
            }
            Ok((number, gutter))
        };
        let (wanted, added) = parse(numerator)?;
        let (total, total_added) = parse(denominator)?;
        if total <= 0.0
            || wanted > total
            || wanted == total && added.unwrap_or(0.0) > total_added.unwrap_or(0.0)
        {
            return Err(self.error("Column fraction overflows or has a nonpositive denominator"));
        }
        self.index(index)?;
        let ratio = wanted / total;
        let coefficient = added.unwrap_or(0.0) - total_added.unwrap_or(1.0 - ratio);
        if !ratio.is_finite() || !(ratio * 100.0).is_finite() || !coefficient.is_finite() {
            return Err(self.error("Column fraction overflowed"));
        }
        let percentage = format!("{}%", ratio * 100.0);
        let gutter = if coefficient == 0.0 {
            String::new()
        } else {
            self.css_inner(
                &self.config_size("/theme/columns/gutters", index)?,
                index,
                false,
                depth + 1,
            )?
        };
        if wanted < 0.0 {
            self.config.migration_notice("EU_MIGRATION_COLUMN_SIGN", self.offset, || {
                // Resolve the actual gutter expression, rather than var[1], which
                // a user-defined spacing token named `1` could shadow.
                let explicit = if coefficient == 0.0 { percentage.clone() } else {
                    format!("calc({percentage} {} {} * ({gutter}))", if coefficient < 0.0 { "-" } else { "+" }, coefficient.abs())
                };
                format!("`{numerator}/{denominator}` keeps the legacy signed-column formula. At `{}`, its explicit equivalent is `{explicit}`. `negate({}/{denominator})` negates the whole positive width instead and can change the layout.", self.config.breakpoints[index.unwrap()].0, numerator.trim_start_matches('-'))
            });
        }
        if coefficient == 0.0 {
            return Ok(percentage);
        }
        let amount = scale(&gutter, coefficient.abs(), self.offset)?;
        Ok(format!(
            "calc({percentage} {} {amount})",
            if coefficient < 0.0 { "-" } else { "+" }
        ))
    }
    fn container_padding(&self, index: Option<usize>, depth: usize) -> Result<String, Error> {
        if depth > 64 {
            return Err(self.error("Cyclic container size"));
        }
        let padding = self.config_size("/theme/container/padding", index)?;
        if padding.starts_with('*') {
            self.config.beta6_warning(self.offset, || format!("Dynamic container padding `{padding}` was not supported by beta.6; review its newly active viewport-based sizing"));
            let args = arguments(&padding).map_err(|e| self.error(e.message))?;
            if args[0] != "*" || args.len() > 2 {
                return Err(
                    self.error("Dynamic container padding expects * and an optional minimum")
                );
            }
            let maximum = self.config_size("/theme/container/maxWidth", index)?;
            let maximum = self.css_inner(&maximum, index, false, depth + 1)?;
            let dynamic = format!("calc((100vw - {maximum}) / 2)");
            return if args.len() == 2 {
                Ok(format!(
                    "max({}, {dynamic})",
                    self.css_inner(args[1], index, false, depth + 1)?
                ))
            } else {
                Ok(dynamic)
            };
        }
        self.css_inner(&padding, index, false, depth + 1)
    }
    pub fn container(&self, index: Option<usize>) -> Result<Vec<(&'static str, String)>, Error> {
        let padding = self.container_padding(index, 0)?;
        let dynamic = self
            .config_size("/theme/container/padding", index)?
            .starts_with('*');
        let mut values = vec![
            ("padding-left", padding.clone()),
            ("padding-right", padding),
        ];
        if !dynamic {
            values.push((
                "max-width",
                self.css(
                    &self.config_size("/theme/container/maxWidth", index)?,
                    index,
                    false,
                )?,
            ));
        }
        values.extend([
            ("margin-left", if dynamic { "0" } else { "auto" }.into()),
            ("margin-right", if dynamic { "0" } else { "auto" }.into()),
            ("width", if dynamic { "100vw" } else { "100%" }.into()),
        ]);
        Ok(values)
    }
    fn between(&self, args: &str, index: Option<usize>, font: bool) -> Result<String, Error> {
        let index = self.index(index)?;
        let pair = args
            .char_indices()
            .filter(|(_, c)| *c == '-')
            .find_map(|(i, _)| {
                Some((
                    dimension(args[..i].trim())?,
                    dimension(args[i + 1..].trim())?,
                ))
            })
            .ok_or_else(|| self.error("between() expects two lengths, such as 16px-24px"))?;
        let ((min, unit), (max, max_unit)) = pair;
        if unit != max_unit || !matches!(unit, "px" | "rem") {
            return Err(self.error("between() lengths must have matching px or rem units"));
        }
        if min == max {
            return Ok(format!("{max}{unit}"));
        }
        let mut low = self.config.breakpoints[index].1;
        // Keep the established interpolation anchor at the last whole pixel.
        // Media coverage uses < next breakpoint; changing the slope is separate.
        let mut high = self
            .config
            .breakpoints
            .get(index + 1)
            .map(|(_, n)| n - 1.0)
            .unwrap_or(low + 200.0);
        if low == 0.0 {
            low = 320.0;
        }
        if unit == "rem" {
            let root = self
                .config
                .value
                .pointer("/theme/typography/rootSize")
                .and_then(scalar)
                .unwrap_or_else(|| "18px".into());
            let root = dimension(&root)
                .filter(|(n, u)| *n > 0.0 && *u == "px")
                .ok_or_else(|| {
                    self.error("Fluid rem sizing requires a positive px typography.rootSize")
                })?
                .0;
            low /= root;
            high /= root;
        }
        if high <= low || !low.is_finite() || !high.is_finite() || !(high - low).is_finite() {
            return Err(self.error("between() requires a finite positive viewport range"));
        }
        if !(max - min).is_finite() {
            return Err(self.error("between() endpoint difference overflowed"));
        }
        if !font && self.config.breakpoints[index].1 == 0.0 {
            self.config.migration_warning(self.offset, || format!("At `{}`, spacing `between({args})` now uses the same 320px lower viewport endpoint for both its offset and slope (resolved interval {low}{unit}–{high}{unit}); the legacy spacing formula used a different interval", self.config.breakpoints[index].0));
        }
        Ok(format!(
            "calc({min}{unit} + {} * ((100vw - {low}{unit}) / {}))",
            max - min,
            high - low
        ))
    }
    fn rhythm(&self, args: &str, index: Option<usize>, depth: usize) -> Result<String, Error> {
        let args = split_top_level(args, ',').map_err(|e| self.error(e.message))?;
        if args.is_empty() || args.len() > 2 {
            return Err(
                self.error("vertical-rhythm() expects a font token path and optional line height")
            );
        }
        let token = crate::config::lookup(self.config.value, args[0])
            .ok_or_else(|| self.error(format!("Unknown typography path `{}`", args[0])))?;
        let token = self.at(token, index)?;
        let raw = scalar(token.get("font-size").unwrap_or(token))
            .ok_or_else(|| self.error("vertical-rhythm() requires a font size"))?;
        let size = self.css_inner(&raw, index, true, depth + 1)?;
        let line = match args.get(1) {
            Some(v) => v.to_string(),
            None => self.config_size("/theme/typography/lineHeight", index)?,
        };
        let line = line
            .parse::<f64>()
            .ok()
            .filter(|n| n.is_finite() && *n > 0.0)
            .ok_or_else(|| {
                self.error("vertical-rhythm() requires a positive unitless line height")
            })?;
        let additive = size
            .strip_prefix("calc(")
            .and_then(|s| s.strip_suffix(')'))
            .is_some_and(|body| {
                ['+', '-'].iter().any(|op| {
                    split_top_level(body, *op).is_ok_and(|parts| {
                        parts.len() > 1 && parts.iter().all(|p| !p.trim().is_empty())
                    })
                })
            });
        if line != 1.0 && additive && !token.is_object() {
            self.config.migration_warning(self.offset, || format!("At `{}`, vertical-rhythm({}) scales the whole resolved `{raw}` by {line}; the legacy scalar calculation removed an outer calc() and could multiply only its final term", index.map(|i| self.config.breakpoints[i].0.as_str()).unwrap_or("all widths"), args[0]));
        }
        scale(&size, line, self.offset)
    }
}
