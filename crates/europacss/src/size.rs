//! Shared sizing primitives, ported incrementally from parseSize.js.
use crate::{
    config::{scalar, Config},
    Error,
};
use serde_json::Value;

/// Design pixels use a reference viewport and retain Europa's zoom variable.
/// Initially used by @unpack; expression and spacing integration follows separately.
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
    Ok(format!("calc({vw}vw * var(--ec-zoom))"))
}
