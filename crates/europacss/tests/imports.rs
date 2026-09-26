use europacss::{compile, compile_file, resolve_config, Error, Output, Request};
use parcel_sourcemap::SourceMap;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Project(PathBuf);
impl Project {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "europa-import-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
    fn write(&self, path: &str, source: &str) {
        let path = self.0.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, source).unwrap();
    }
    fn request(&self) -> Request {
        Request {
            filename: self.0.join("app.css").to_string_lossy().into_owned(),
            config: resolve_config(json!({})).unwrap(),
            source_map: true,
            browsers: vec!["chrome 100".into()],
            ..Request::default()
        }
    }
    fn compile(&self) -> Result<Output, Error> {
        compile_file(&self.request(), None)
    }
    fn css(&self, expected: &str) {
        let actual = self.compile().unwrap();
        assert!(actual.warnings.is_empty(), "{:?}", actual.warnings);
        let mut request = self.request();
        request.source = expected.into();
        assert_eq!(actual.css, compile(&request).unwrap().css);
    }
}
impl Drop for Project {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn nested_and_repeated_imports_preserve_order_and_unique_dependencies() {
    let p = Project::new();
    p.write("app.css", "@import 'parts/one.css'; @import url(parts/two.css); @import 'parts/one.css'; .last { color:black }");
    p.write(
        "parts/one.css",
        "@import '../shared.css'; .one { @color fg red; }",
    );
    p.write("parts/two.css", ".two { @color fg blue; }");
    p.write("shared.css", ".shared { color:green }");
    p.css(".shared{color:green}.one{color:red}.two{color:blue}.shared{color:green}.one{color:red}.last{color:black}");
    let result = p.compile().unwrap();
    assert_eq!(
        result.dependencies,
        ["app.css", "parts/one.css", "shared.css", "parts/two.css"].map(|name| p
            .0
            .join(name)
            .to_string_lossy()
            .into_owned())
    );
}

#[test]
fn import_conditions_wrap_layers_and_keep_europa_rules_scoped() {
    let p = Project::new();
    p.write("app.css", "@layer reset, components; @import 'one.css' layer(components) supports(display: grid) screen and (min-width: 800px); @import 'one.css' layer supports(not (display: flex));");
    p.write(
        "one.css",
        ".card { @color fg red; &:hover { @space padding 4px; } }",
    );
    p.css("@layer reset, components; @media screen and (min-width:800px) { @supports (display:grid) { @layer components { .card {color:red; &:hover {padding:4px} } } } } @supports not (display:flex) { @layer { .card {color:red; &:hover{padding:4px} } } }");
}

#[test]
fn urls_are_rebased_from_each_origin_to_the_output_directory() {
    let p = Project::new();
    p.write(
        "app.css",
        "@import 'parts/one.css'; .entry { background: url(images/root.svg) }",
    );
    p.write("parts/one.css", r#"@font-face {font-family:Demo;src:url('../fonts/demo.woff2?#iefix')} .card { background: image-set(url("pic\20 one.svg?v=2#icon") 1x, url(./two.svg) 2x); mask:url(#icon); --remote:url(https://example.com/a.svg); --data:url('data:image/svg+xml,<svg/>'); --root:url(/static/a.svg); content:'url(fake.svg)'; }"#);
    fs::create_dir(p.0.join("dist")).unwrap();
    let result = compile_file(&p.request(), Some(&p.0.join("dist/app.css"))).unwrap();
    for url in [
        "../fonts/demo.woff2?#iefix",
        "../parts/pic%20one.svg?v=2#icon",
        "../parts/two.svg",
        "../images/root.svg",
        "#icon",
        "https://example.com/a.svg",
        "/static/a.svg",
        "url(fake.svg)",
    ] {
        assert!(result.css.contains(url), "{url}: {}", result.css);
    }
    let mut request = p.request();
    request.config["theme"]["images"] = json!({"hero":"url(assets/hero.svg)"});
    p.write("parts/one.css", ".card { background: theme(images.hero) }");
    let result = compile_file(&request, Some(&p.0.join("dist/app.css"))).unwrap();
    assert!(result.css.contains("../parts/assets/hero.svg"));
}

#[test]
fn css_escaped_and_percent_encoded_paths_and_utf8_bom_work() {
    let p = Project::new();
    p.write(
        "app.css",
        "\u{feff}@import 'parts/a\\20 b.css'; @import url(parts/%C3%B8.css);",
    );
    p.write(
        "parts/a b.css",
        "\u{feff}@charset \"UTF-8\"; .a { color:red }",
    );
    p.write("parts/ø.css", ".b { color:blue }");
    p.css(".a{color:red}.b{color:blue}");
}

#[test]
fn diagnostics_identify_the_authored_file_for_each_compiler_stage() {
    let p = Project::new();
    p.write("app.css", "@import 'nested.css';");
    for (source, code, line, column) in [
        (
            "/* 🙂 */\r\n.x {\r\n @font no-such-token;\r\n}",
            "EU_CONFIG",
            3,
            2,
        ),
        (
            "/* 🙂 */\r\n.x { &:nth-child(nope) {color:red} }",
            "EU_CSS",
            2,
            6,
        ),
        ("\n.x { color: 'unfinished; }", "EU_PARSE", 2, 27),
        ("\n@import 'missing.css';", "EU_IMPORT", 2, 1),
    ] {
        p.write("nested.css", source);
        for source_map in [false, true] {
            let mut request = p.request();
            request.source_map = source_map;
            let error = compile_file(&request, None).unwrap_err();
            assert_eq!(error.code, code, "{error:?}");
            assert_eq!(
                error.filename.as_deref(),
                Some(p.0.join("nested.css").to_str().unwrap())
            );
            assert_eq!((error.line, error.column), (line, column), "{error:?}");
        }
    }
}

#[test]
fn maps_include_original_contents_and_map_back_to_multiple_files() {
    let p = Project::new();
    let child = "/* 🙂 */\r\n.card {\r\n &:hover { @color fg red; }\r\n}";
    p.write(
        "app.css",
        "@import 'parts/card.css';\n.entry { color: blue; }",
    );
    p.write("parts/card.css", child);
    let result = p.compile().unwrap();
    let map_json: serde_json::Value = serde_json::from_str(result.map.as_ref().unwrap()).unwrap();
    let mut map = SourceMap::from_json("/", result.map.as_ref().unwrap()).unwrap();
    for (selector, filename, line, column) in [
        (".card:hover", "parts/card.css", 2, 1),
        (".entry", "app.css", 1, 0),
    ] {
        let generated = result
            .css
            .lines()
            .position(|s| s.contains(selector))
            .unwrap();
        let original = map
            .find_closest_mapping(generated as u32, 0)
            .unwrap()
            .original
            .unwrap();
        assert_eq!(
            map_json["sources"][original.source as usize],
            p.0.join(filename).to_str().unwrap()
        );
        assert_eq!(
            (original.original_line, original.original_column),
            (line, column)
        );
        if filename.contains("card") {
            assert_eq!(map_json["sourcesContent"][original.source as usize], child);
        }
    }
}

#[test]
fn external_imports_are_retained_and_unsafe_reordering_is_rejected() {
    let p = Project::new();
    p.write(
        "app.css",
        "@import 'https://example.com/font.css' layer(fonts); @import 'one.css';",
    );
    p.write("one.css", ".one {color:red}");
    assert!(p
        .compile()
        .unwrap()
        .css
        .contains("https://example.com/font.css"));
    for source in [
        "@import 'one.css'; @import 'https://example.com/font.css';",
        ".x{color:red} @import 'one.css';",
        "@media print { @import 'one.css'; }",
    ] {
        p.write("app.css", source);
        assert_eq!(p.compile().unwrap_err().code, "EU_IMPORT_ORDER");
    }
    p.write("app.css", "@import 'one.css' print;");
    p.write("one.css", "@import 'https://example.com/font.css';");
    assert_eq!(p.compile().unwrap_err().code, "EU_IMPORT_ORDER");
    let mut request = p.request();
    request.source = "@import 'https://example.com/font.css';".into();
    assert!(compile(&request)
        .unwrap()
        .css
        .contains("https://example.com/font.css"));
    request.source = "@import 'one.css';".into();
    assert_eq!(compile(&request).unwrap_err().code, "EU_IMPORT");
}

#[test]
fn cycles_limits_and_namespace_isolation_fail_explicitly() {
    let p = Project::new();
    p.write("app.css", "@import 'one.css';");
    p.write("one.css", "\n@import 'app.css';");
    let error = p.compile().unwrap_err();
    assert_eq!(error.code, "EU_IMPORT_CYCLE");
    assert_eq!(error.line, 2);
    assert!(error.message.contains("app.css ->"));
    p.write(
        "one.css",
        "@namespace svg url(http://www.w3.org/2000/svg); svg|a {fill:red}",
    );
    assert_eq!(p.compile().unwrap_err().code, "EU_IMPORT_NAMESPACE");
    p.write("app.css", "@import '0.css';");
    for i in 0..65 {
        p.write(&format!("{i}.css"), &format!("@import '{}.css';", i + 1));
    }
    assert_eq!(p.compile().unwrap_err().code, "EU_LIMIT");
    // A small diamond graph must hit the expansion budget even though reads are cached.
    p.write("app.css", "@import '0.css';");
    for i in 0..17 {
        p.write(
            &format!("{i}.css"),
            &format!("@import '{}.css'; @import '{}.css';", i + 1, i + 1),
        );
    }
    p.write("17.css", ".x{color:red}");
    assert_eq!(p.compile().unwrap_err().code, "EU_LIMIT");
}

#[test]
fn malformed_imports_fail_without_panicking() {
    let p = Project::new();
    p.write("one.css", ".a{color:red}");
    for import in [
        "",
        "' '",
        "😀",
        "one.css",
        "url()",
        "'one.css' layer()",
        "'one.css' supports()",
    ] {
        p.write("app.css", &format!("@import {import};"));
        assert!(p.compile().is_err(), "{import}");
    }
}

#[test]
fn asset_visitor_handles_image_set_strings_escaped_functions_and_plain_url_words() {
    let p = Project::new();
    p.write("app.css", "@import 'parts/card.css';");
    p.write("parts/card.css", r#".url { --url:url; background:image-set(/*literal*/ "one.svg" 1x, url(two.svg) 2x); mask:u\72l(icon.svg); --asset:\75rl(three.svg); --text:"url(literal.svg)"; }"#);
    let result = p.compile().unwrap();
    for value in [
        "parts/one.svg",
        "parts/two.svg",
        "parts/icon.svg",
        "parts/three.svg",
        "url(literal.svg)",
    ] {
        assert!(result.css.contains(value), "{value}: {}", result.css);
    }
}
