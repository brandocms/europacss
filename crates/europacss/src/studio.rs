//! Config Studio previews use the same resolver and compiler as normal builds.
use crate::{
    compile,
    config::Config,
    config_file::{ConfigValue, Inheritance},
    Request,
};
pub mod fonts;
mod source_paths;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
pub struct Specimen {
    pub kind: &'static str,
    pub name: String,
    pub id: String,
    pub token: Value,
    pub config_paths: Vec<Vec<String>>,
    pub dependency_paths: Vec<Vec<String>>,
    pub css: String,
    pub context_css: String,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct Preview {
    pub breakpoints: Vec<(String, f64)>,
    pub specimens: Vec<Specimen>,
    pub css: String,
    pub notes: Vec<String>,
    pub families: Vec<(String, String)>,
    pub colors: Vec<Color>,
    pub root_css: String,
}

#[derive(Serialize)]
pub struct Color {
    pub name: String,
    pub value: String,
    pub compiled_value: Option<String>,
    pub config_paths: Vec<Vec<String>>,
    pub dependency_paths: Vec<Vec<String>>,
}

fn safe_token(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/' | '.'))
}

pub fn preview(source: &str) -> Result<Preview, String> {
    ConfigContext::default().preview(source)
}

/// Inherited data selected by the config path at Studio startup. Preview requests
/// can edit the child, but cannot choose files for the server to read.
#[derive(Default)]
pub struct ConfigContext {
    inheritance: Inheritance,
}

impl ConfigContext {
    pub fn new(source: &str, path: Option<&std::path::Path>) -> Result<Self, String> {
        // Keep the editor usable for invalid, non-inheriting configs as before.
        let authored = json5::from_str::<ConfigValue>(source).ok();
        if authored
            .as_ref()
            .is_some_and(|v| v.0.get("extends").is_some())
        {
            let path = path.ok_or("Config inheritance in Studio requires --config")?;
            return Ok(Self {
                inheritance: crate::config_file::load_raw(path, Some(source), &mut Vec::new())?
                    .inheritance,
            });
        }
        Ok(Self::default())
    }

    pub fn preview(&self, source: &str) -> Result<Preview, String> {
        preview_in_context(source, &self.inheritance)
    }
}

fn preview_in_context(source: &str, inheritance: &Inheritance) -> Result<Preview, String> {
    if source.len() > 1024 * 1024 {
        return Err("Studio configs are limited to 1 MiB".into());
    }
    let authored = json5::from_str::<ConfigValue>(source)
        .map_err(|e| e.to_string())?
        .0;
    let config = inheritance.resolve(authored.clone())?;
    let checked = Config::new(&config).map_err(|e| e.to_string())?;
    let mut result = Preview {
        breakpoints: checked.breakpoints.clone(),
        specimens: Vec::new(),
        css: String::new(),
        notes: Vec::new(),
        families: Vec::new(),
        colors: Vec::new(),
        root_css: String::new(),
    };
    if inheritance.has_parent() {
        result.notes.push("Inherited configs were loaded at Studio startup. Edit local overrides here; restart Studio after changing parent files or extends. Source links refer to the local config.".into());
    }
    match compile(&Request {
        source: "html {font-size:theme('typography.base', 16px)}".into(),
        filename: "studio/root".into(),
        config: config.clone(),
        ..Request::default()
    }) {
        Ok(output) => result.root_css = output.css,
        Err(error) => result.notes.push(format!(
            "Root font size could not compile; the preview uses the browser default: {error}"
        )),
    }
    fn colors(value: &Value, path: &str, out: &mut Vec<String>) {
        if out.len() > 128 {
            return;
        }
        if crate::config::scalar(value).is_some() {
            if !path.is_empty() && !out.iter().any(|name| name == path) {
                out.push(path.into());
            }
        } else if let Some(object) = value.as_object() {
            for (key, value) in object {
                let path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}/{key}")
                };
                colors(value, &path, out);
            }
        }
    }
    let mut palette = Vec::new();
    if let Some(value) = config.pointer("/theme/colors") {
        colors(value, "", &mut palette);
    }
    if palette.len() > 128 {
        result
            .notes
            .push("Color checks show the first 128 resolved color tokens.".into());
    }
    for name in palette.into_iter().take(128) {
        // Use the same lookup precedence as @color (including literal slash keys).
        let Some(value) = checked
            .get("/theme/colors", &name)
            .and_then(crate::config::scalar)
        else {
            continue;
        };
        let (config_paths, dependency_paths) =
            source_paths::locate(&authored, &config, &["theme", "colors"], Some(&name));
        // Check the backend's emitted color, including its channel/alpha precision.
        // Conditional output or invalid tokens need review rather than a guessed fallback.
        let compiled_value = if safe_token(&name) {
            compile(&Request {
                source: format!(".color {{ @color fg {name}; }}"),
                filename: format!("studio/colors/{name}"),
                config: config.clone(),
                ..Request::default()
            })
            .ok()
            .and_then(|output| crate::parser::parse(&output.css).ok())
            .and_then(|nodes| {
                if nodes.len() != 1 || nodes[0].text != ".color" {
                    return None;
                }
                let children = nodes[0].children.as_ref()?;
                if children.len() != 1 || children[0].children.is_some() {
                    return None;
                }
                let (property, value) = children[0].text.split_once(':')?;
                (property.trim() == "color").then(|| value.trim().to_owned())
            })
        } else {
            None
        };
        result.colors.push(Color {
            name,
            value,
            compiled_value,
            config_paths,
            dependency_paths,
        });
    }
    if let Some(families) = config
        .pointer("/theme/typography/families")
        .and_then(Value::as_object)
    {
        for name in families.keys().filter(|name| safe_token(name)) {
            if let Ok(output) = compile(&Request {
                source: format!(".type {{ @font {name}; }}"),
                filename: "studio/families".into(),
                config: config.clone(),
                ..Request::default()
            }) {
                result.families.push((name.clone(), output.css));
            }
        }
    }
    let mut tokens = Vec::new();
    fn collect(
        value: &Value,
        path: &str,
        kind: &'static str,
        bps: &[(String, f64)],
        out: &mut Vec<(&'static str, String, Value)>,
    ) {
        if out.len() >= 96 {
            return;
        }
        if let Some(object) = value.as_object() {
            let is_token = !path.is_empty()
                && (object.contains_key("*")
                    || object.contains_key("__base__")
                    || bps.iter().any(|(bp, _)| object.contains_key(bp)));
            if !is_token {
                for (key, value) in object {
                    let key = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}/{key}")
                    };
                    collect(value, &key, kind, bps, out);
                }
                return;
            }
        }
        if !path.is_empty() {
            out.push((kind, path.into(), value.clone()));
        }
    }
    for (kind, path) in [
        ("typography", "/theme/typography/sizes"),
        ("spacing", "/theme/spacing"),
    ] {
        if let Some(value) = config.pointer(path) {
            collect(value, "", kind, &result.breakpoints, &mut tokens);
        }
    }
    if tokens.len() >= 96 {
        result.notes.push("Showing the first 96 typography/spacing tokens; narrow the config to inspect additional tokens.".into());
    }
    for name in ["container", "1/4", "1/3", "1/2", "2/3", "1/1"] {
        tokens.push((
            "grid",
            name.into(),
            if name == "container" {
                config
                    .pointer("/theme/container")
                    .cloned()
                    .unwrap_or(Value::Null)
            } else {
                config
                    .pointer("/theme/columns")
                    .cloned()
                    .unwrap_or(Value::Null)
            },
        ));
    }
    for (kind, name, token) in tokens {
        let id = format!("europa-sample-{}", result.specimens.len());
        let rule = match kind {
            "typography" => format!("#{id} {{ @fontsize {name}; }}"),
            "spacing" => format!("#{id} {{ @space width {name}; }}"),
            _ if name == "container" => format!("#{id} {{ @space container; }}"),
            _ => format!("#{id} {{ @column {name}; }}"),
        };
        let compiled = if safe_token(&name) {
            compile(&Request {
                source: rule,
                filename: format!("studio/{kind}/{name}"),
                config: config.clone(),
                ..Request::default()
            })
            .map(|output| output.css)
            .map_err(|e| e.to_string())
        } else {
            Err("This token name cannot be used directly in a Europa directive".into())
        };
        let (css, error) = match compiled {
            Ok(css) => {
                result.css.push_str(&css);
                (css, None)
            }
            Err(error) => (String::new(), Some(error)),
        };
        // Compile reusable context roles independently: spacing is padding/gap,
        // while the isolated ruler still measures width.
        let context_rule = match kind {
            "typography" => format!(".context-{id} {{ @fontsize {name}; }}"),
            "spacing" => format!(".context-{id} {{ @space padding {name}; @space gap {name}; }}"),
            _ if name == "container" => format!(".context-{id} {{ @space container; }}"),
            _ => format!(
                ".context-{id} {{ @column {name}; }} .context-columns-{id} {{ @space gap 1; }}"
            ),
        };
        let context_css = if error.is_none() {
            compile(&Request {
                source: context_rule,
                filename: format!("studio/context/{kind}/{name}"),
                config: config.clone(),
                ..Request::default()
            })
            .map(|out| out.css)
            .unwrap_or_default()
        } else {
            String::new()
        };
        let (base, key): (&[&str], _) = match kind {
            "typography" => (&["theme", "typography", "sizes"], Some(name.as_str())),
            "spacing" => (&["theme", "spacing"], Some(name.as_str())),
            _ if name == "container" => (&["theme", "container"], None),
            _ => (&["theme", "columns"], None),
        };
        let (config_paths, dependency_paths) = source_paths::locate(&authored, &config, base, key);
        result.specimens.push(Specimen {
            kind,
            name,
            id,
            token,
            config_paths,
            dependency_paths,
            css,
            context_css,
            error,
        });
    }
    Ok(result)
}
