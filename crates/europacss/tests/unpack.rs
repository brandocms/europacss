mod support;
use europacss::{compile, compile_frontend};
use parcel_sourcemap::SourceMap;
use serde_json::{json, Value};
use support::{assert_css, config, request};

fn unpack_config() -> Value {
    let mut cfg = config();
    cfg["theme"]["container"] =
        json!({"padding":{"mobile":"25px","tablet":"5.555556vw","desktop":"5.555556vw"}});
    cfg["theme"]["columns"] =
        json!({"gutters":{"mobile":"15px","tablet":"40px","desktop":"4.1667vw"}});
    cfg["theme"]["typography"] = json!({"sections":{
        "navigation": {
            "mobile":{"font-size":"17px","line-height":"17px","letter-spacing":"0.12rem"},
            "tablet":{"font-size":"17px","line-height":"17px","letter-spacing":"0.12rem"},
            "desktop":{"font-size":"12px","line-height":"12px","letter-spacing":"0.12rem"}
        },
        "simple": {"mobile":{"color":"red"},"tablet":{"color":"green"},"desktop":{"color":"blue"}}
    }});
    cfg
}

// Ported from __tests__/rules/substituteUnpackAtRules.test.js at tag 1.0.0-beta.16.
const NAVIGATION: &str = "@media (width < 740px) {font-size:17px;line-height:17px;letter-spacing:0.12rem} @media (width >= 740px) and (width < 1024px) {font-size:17px;line-height:17px;letter-spacing:0.12rem} @media (width >= 1024px) {font-size:12px;line-height:12px;letter-spacing:0.12rem}";

#[test]
fn unpacks_property_maps_from_dot_and_slash_paths() {
    for path in [
        "theme.typography.sections.navigation",
        "theme/typography/sections/navigation",
    ] {
        assert_css(
            &format!("article {{@unpack {path};}}"),
            &format!("article {{{NAVIGATION}}}"),
            unpack_config(),
        );
    }
}

#[test]
fn unpacks_container_padding_and_grid_gutter_variables() {
    assert_css(":root {@unpack containerPadding}", ":root {@media (width < 740px) {--container-padding:25px} @media (width >= 740px) and (width < 1024px) {--container-padding:5.555556vw} @media (width >= 1024px) {--container-padding:5.555556vw}}", unpack_config());
    assert_css(":root {@unpack gridGutter}", ":root {@media (width < 740px) {--grid-gutter:15px} @media (width >= 740px) and (width < 1024px) {--grid-gutter:40px} @media (width >= 1024px) {--grid-gutter:4.1667vw}}", unpack_config());
}

#[test]
fn nested_unpack_stays_at_its_source_position() {
    assert_css(
        "article {@unpack theme.typography.sections.navigation; h1 {color:blue; @unpack theme.typography.sections.simple; color:purple}}",
        &format!("article {{{NAVIGATION} h1 {{color:blue; @media (width < 740px) {{color:red}} @media (width >= 740px) and (width < 1024px) {{color:green}} @media (width >= 1024px) {{color:blue}} color:purple}}}}"),
        unpack_config(),
    );
}

#[test]
fn aliases_convert_dpx_with_the_legacy_zoom_and_precision() {
    let cfg = json!({"dpxViewportSize":1440,"theme":{
        "breakpoints":{"xs":"0","md":"1024px"},
        "container":{"padding":{"xs":"75dpx","md":"50dpx"}},
        "columns":{"gutters":{"xs":"25dpx","md":"30dpx"}}
    }});
    assert_css(":root {@unpack containerPadding; @unpack gridGutter}", ":root {@media (width < 1024px) {--container-padding:calc(5.20833vw * var(--ec-zoom))} @media (width >= 1024px) {--container-padding:calc(3.47222vw * var(--ec-zoom))} @media (width < 1024px) {--grid-gutter:calc(1.73611vw * var(--ec-zoom))} @media (width >= 1024px) {--grid-gutter:calc(2.08333vw * var(--ec-zoom))}}", cfg);
}

#[test]
fn dpx_reference_precedence_is_breakpoint_then_collection_then_global() {
    let mut cfg = config();
    cfg["dpxViewportSize"] = json!(1000);
    cfg["dpxViewportSizes"] = json!({"mobile":400,"$sm":800});
    cfg["theme"]["columns"] =
        json!({"gutters":{"mobile":"40dpx","tablet":"40dpx","desktop":"40dpx"}});
    assert_css(":root {@unpack gridGutter}", ":root {@media (width < 740px) {--grid-gutter:calc(10vw * var(--ec-zoom))} @media (width >= 740px) and (width < 1024px) {--grid-gutter:calc(5vw * var(--ec-zoom))} @media (width >= 1024px) {--grid-gutter:calc(4vw * var(--ec-zoom))}}", cfg);
}

#[test]
fn dpx_maximum_uses_the_largest_breakpoint_even_when_config_is_unsorted() {
    let mut cfg = config();
    cfg["theme"]["breakpoints"] = json!({"desktop":"1024px","mobile":"0","tablet":"740px"});
    cfg["dpxViewportSize"] = json!(1000);
    cfg["setMaxForVw"] = json!(true);
    cfg["theme"]["container"] =
        json!({"maxWidth":{"desktop":"1200px"},"padding":{"tablet":"40dpx","desktop":"40dpx"}});
    assert_css(":root {@unpack containerPadding}", ":root {@media (width >= 740px) and (width < 1024px) {--container-padding:calc(4vw * var(--ec-zoom))} @media (width >= 1024px) {--container-padding:48px}}", cfg);
}

#[test]
fn unpack_supports_responsive_scopes_arrays_and_custom_properties() {
    let mut cfg = unpack_config();
    cfg["styles"] = json!({"$lg":{"font-family":["Inter","serif"],"transform":["translateX(1px)","scale(2)"],"--tokens":"{a: 1; b: 2}"}});
    assert_css("@layer ui {.x {@responsive >=tablet {@unpack styles;}}}", "@layer ui {.x {@media (width >= 740px) {@media (width >= 1024px) {font-family:Inter,serif;transform:translateX(1px) scale(2);--tokens:{a: 1; b: 2}}}}}", cfg);
}

#[test]
fn unpack_errors_do_not_silently_drop_invalid_data() {
    let mut cfg = unpack_config();
    cfg["scalar"] = json!("red");
    cfg["bad"] = json!({"mobile":"red"});
    cfg["unknown"] = json!({"typo":{"color":"red"}});
    cfg["inject"] = json!({"mobile":{"color":"red; width:0"}});
    cfg["directive"] = json!({"mobile":{"@unpack":"gridGutter"}});
    for (source, code) in [
        ("@unpack;", "EU_CONTEXT"),
        (".x {@unpack}", "EU_ARGUMENTS"),
        (".x {@unpack gridGutter {color:red}}", "EU_ARGUMENTS"),
        (".x {@unpack missing}", "EU_CONFIG"),
        (".x {@unpack scalar}", "EU_CONFIG"),
        (".x {@unpack bad}", "EU_CONFIG"),
        (".x {@unpack unknown}", "EU_BREAKPOINT"),
        (".x {@unpack inject}", "EU_CONFIG"),
        (".x {@unpack directive}", "EU_CONFIG"),
    ] {
        assert_eq!(
            compile(&request(source, cfg.clone())).unwrap_err().code,
            code,
            "{source}"
        );
    }
}

#[test]
fn invalid_dpx_configuration_fails_at_the_unpack_directive() {
    let mut cfg = config();
    cfg["theme"]["columns"] = json!({"gutters":{"desktop":"40dpx"}});
    for width in [json!(0), json!(-1), json!("100px"), json!(null)] {
        cfg["dpxViewportSize"] = width;
        let error = compile(&request(":root {\n @unpack gridGutter;\n}", cfg.clone())).unwrap_err();
        assert_eq!(
            (error.code.as_str(), error.line, error.column),
            ("EU_SIZE", 2, 2)
        );
    }
    cfg["dpxViewportSize"] = json!(1440);
    cfg["setMaxForVw"] = json!(true);
    cfg["theme"]["container"] = json!({"maxWidth":{"desktop":"100%"}});
    assert!(compile(&request(":root {@unpack gridGutter}", cfg))
        .unwrap_err()
        .message
        .contains("container length"));
}

#[test]
fn generated_variables_keep_the_unpack_source_mapping() {
    let source = "/* 🙂 */\r\n:root {\r\n  @unpack gridGutter;\r\n}";
    let req = request(source, unpack_config());
    let output = compile_frontend(&req).unwrap();
    let mut map = SourceMap::from_json("/", output.map.as_ref().unwrap()).unwrap();
    for (line, text) in output.css.lines().enumerate() {
        if text.contains("--grid-gutter") {
            let original = map
                .find_closest_mapping(line as u32, 0)
                .unwrap()
                .original
                .unwrap();
            assert_eq!((original.original_line, original.original_column), (2, 2));
        }
    }
}
