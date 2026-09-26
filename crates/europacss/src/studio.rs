//! Config Studio previews use the same resolver and compiler as normal builds.
use crate::{compile, config::Config, config_file::ConfigValue, resolve_config, Request};
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
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct Preview {
    pub breakpoints: Vec<(String, f64)>,
    pub specimens: Vec<Specimen>,
    pub css: String,
    pub notes: Vec<String>,
    pub families: Vec<(String, String)>,
}

fn safe_token(key: &str) -> bool {
    !key.is_empty()
        && key
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/' | '.'))
}

pub fn preview(source: &str) -> Result<Preview, String> {
    if source.len() > 1024 * 1024 {
        return Err("Studio configs are limited to 1 MiB".into());
    }
    let authored = json5::from_str::<ConfigValue>(source)
        .map_err(|e| e.to_string())?
        .0;
    let config = resolve_config(authored.clone()).map_err(|e| e.to_string())?;
    let checked = Config::new(&config).map_err(|e| e.to_string())?;
    let mut result = Preview {
        breakpoints: checked.breakpoints.clone(),
        specimens: Vec::new(),
        css: String::new(),
        notes: Vec::new(),
        families: Vec::new(),
    };
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
            error,
        });
    }
    Ok(result)
}
