//! Read an explicit font stylesheet into a fixed, local-only asset snapshot.
use lightningcss::{
    rules::{
        font_face::{FontFaceProperty, Source},
        CssRule,
    },
    stylesheet::{ParserOptions, PrinterOptions, StyleSheet},
    traits::ToCss,
};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Default, Serialize)]
pub struct Fonts {
    pub css: String,
    pub faces: Vec<Face>,
    pub warnings: Vec<String>,
    #[serde(skip)]
    pub assets: Vec<Asset>,
}
#[derive(Serialize)]
pub struct Face {
    pub family: String,
    pub weight: String,
    pub style: String,
}
pub struct Asset {
    pub mime: &'static str,
    pub bytes: Vec<u8>,
}

pub fn load(stylesheet: &Path, public_dir: Option<&Path>) -> Result<Fonts, String> {
    let stylesheet = stylesheet
        .canonicalize()
        .map_err(|e| format!("{}: {e}", stylesheet.display()))?;
    let parent = stylesheet.parent().unwrap();
    let public = public_dir
        .map(Path::canonicalize)
        .transpose()
        .map_err(|e| format!("Font public directory: {e}"))?;
    if fs::metadata(&stylesheet).map_err(|e| e.to_string())?.len() > 1024 * 1024 {
        return Err("Font stylesheet exceeds 1 MiB".into());
    }
    let source = fs::read_to_string(&stylesheet).map_err(|e| e.to_string())?;
    let sheet = StyleSheet::parse(&source, ParserOptions::default()).map_err(|e| e.to_string())?;
    let mut result = Fonts::default();
    let mut paths = Vec::<PathBuf>::new();
    let mut total = 0usize;
    for rule in sheet.rules.0 {
        let mut rule = match rule {
            CssRule::FontFace(rule) => rule,
            _ => {
                result.warnings.push("Only top-level @font-face rules are loaded; imports and other rules in the font stylesheet are skipped.".into());
                continue;
            }
        };
        let mut face = Face {
            family: String::new(),
            weight: "normal".into(),
            style: "normal".into(),
        };
        let mut has_source = false;
        for property in &mut rule.properties {
            match property {
                FontFaceProperty::FontFamily(value) => {
                    face.family = value
                        .to_css_string(PrinterOptions::default())
                        .map_err(|e| e.to_string())?
                }
                FontFaceProperty::FontWeight(value) => {
                    face.weight = value
                        .to_css_string(PrinterOptions::default())
                        .map_err(|e| e.to_string())?
                }
                FontFaceProperty::FontStyle(value) => {
                    face.style = value
                        .to_css_string(PrinterOptions::default())
                        .map_err(|e| e.to_string())?
                }
                FontFaceProperty::Source(sources) => {
                    let mut mapped = Vec::new();
                    for source in std::mem::take(sources) {
                        let Source::Url(mut url) = source else {
                            continue;
                        };
                        match local_path(&url.url.url, parent, public.as_deref()) {
                            Ok(path) => {
                                let index = if let Some(index) =
                                    paths.iter().position(|p| p == &path)
                                {
                                    index
                                } else {
                                    let mime = match path
                                        .extension()
                                        .and_then(|e| e.to_str())
                                        .unwrap_or("")
                                        .to_ascii_lowercase()
                                        .as_str()
                                    {
                                        "woff2" => "font/woff2",
                                        "woff" => "font/woff",
                                        "ttf" => "font/ttf",
                                        "otf" => "font/otf",
                                        _ => {
                                            result.warnings.push(format!(
                                                "Skipped unsupported font file: {}",
                                                url.url.url
                                            ));
                                            continue;
                                        }
                                    };
                                    let size =
                                        fs::metadata(&path).map_err(|e| e.to_string())?.len();
                                    if size > 16 * 1024 * 1024
                                        || total as u64 + size > 64 * 1024 * 1024
                                        || paths.len() >= 128
                                    {
                                        return Err("Studio font limits: 16 MiB per file, 64 MiB total, 128 files".into());
                                    }
                                    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                                    total += bytes.len();
                                    let index = paths.len();
                                    paths.push(path);
                                    result.assets.push(Asset { mime, bytes });
                                    index
                                };
                                url.url.url = format!("/api/fonts/{index}").into();
                                mapped.push(Source::Url(url));
                            }
                            Err(error) => result.warnings.push(format!("{}: {error}", url.url.url)),
                        }
                    }
                    has_source |= !mapped.is_empty();
                    *sources = mapped;
                }
                _ => {}
            }
        }
        // A missing file must not silently become a system-installed font.
        rule.properties
            .retain(|p| !matches!(p, FontFaceProperty::Source(s) if s.is_empty()));
        if has_source && !face.family.is_empty() {
            result.css.push_str(
                &rule
                    .to_css_string(PrinterOptions::default())
                    .map_err(|e| e.to_string())?,
            );
            result.faces.push(face);
        } else {
            result.warnings.push(format!(
                "No local font file could be loaded for {}",
                face.family
            ));
        }
    }
    result.warnings.sort();
    result.warnings.dedup();
    Ok(result)
}

fn local_path(url: &str, parent: &Path, public: Option<&Path>) -> Result<PathBuf, String> {
    if url.starts_with("//") || url.contains(':') {
        return Err("Remote and data URLs are not loaded by Studio".into());
    }
    let path = url.split(['?', '#']).next().unwrap_or("");
    let mut bytes = Vec::new();
    let mut input = path.bytes();
    while let Some(byte) = input.next() {
        bytes.push(if byte == b'%' {
            let a = input
                .next()
                .and_then(|c| (c as char).to_digit(16))
                .ok_or("Invalid URL escape")?;
            let b = input
                .next()
                .and_then(|c| (c as char).to_digit(16))
                .ok_or("Invalid URL escape")?;
            (a * 16 + b) as u8
        } else {
            byte
        });
    }
    let path = String::from_utf8(bytes).map_err(|_| "Font URL is not UTF-8")?;
    let candidate = if let Some(relative) = path.strip_prefix('/') {
        let root = public.ok_or("Root-relative font URL needs --public-dir")?;
        let exact = root.join(relative);
        // Common Vite/Craft deployment: public/fonts is mounted at /assets/fonts.
        if exact.exists() {
            exact
        } else {
            root.join(relative.strip_prefix("assets/").unwrap_or(relative))
        }
    } else {
        parent.join(path)
    };
    let path = candidate
        .canonicalize()
        .map_err(|e| format!("Font file unavailable ({e})"))?;
    if !path.starts_with(parent) && !public.is_some_and(|root| path.starts_with(root)) {
        return Err("Font path leaves the stylesheet/public directories".into());
    }
    if !path.is_file() {
        return Err("Font source is not a file".into());
    }
    Ok(path)
}
