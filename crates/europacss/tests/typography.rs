mod support;
use europacss::compile;
use serde_json::{json, Value};
use support::{assert_css, config, request};

fn font_config() -> Value {
    let mut cfg = config();
    cfg["dpxViewportSize"] = json!(1000);
    cfg["theme"]["container"] = json!({"maxWidth":{"desktop":"1200px"}});
    cfg["theme"]["typography"] = json!({"rootSize":"16px", "families":{"sans":["Inter","sans-serif"]}, "sizes":{
        "body":{"*":"20px/1.5","desktop":"24px/1.4"},
        "heading/large":{"__base__":{"font-family":["Inter","sans-serif"],"line-height":1.1},"*":{"font-size":"40px","font-weight":600},"desktop":{"font-size":"60px","font-weight":700}},
        "heading":{"large":{"*":"100px"}}, "nested":{"small":{"*":"12px"}}
    }});
    cfg
}

#[test]
fn literal_font_sizes_and_native_calculations() {
    for (value, expected) in [
        ("20px", "font-size:20px"),
        ("20px/1.5", "font-size:20px;line-height:1.5"),
        ("calc(20px / 2)/1.5", "font-size:10px;line-height:1.5"),
        ("clamp(16px, 4vw, 48px)", "font-size:clamp(16px, 4vw, 48px)"),
    ] {
        assert_css(
            &format!(".x {{@fontsize {value}}}"),
            &format!(".x {{{expected}}}"),
            font_config(),
        );
    }
}

#[test]
fn font_tokens_wildcards_modifiers_and_line_height_overrides() {
    for (query, expected) in [
        ("body", "font-size:20px;line-height:1.5"),
        ("body/1.2", "font-size:20px;line-height:1.2"),
        ("body(1.5)", "font-size:30px;line-height:1.5"),
        ("body(1.5)/2", "font-size:30px;line-height:2"),
        ("nested/small", "font-size:12px"),
    ] {
        assert_css(
            &format!(".x {{@fontsize {query} mobile}}"),
            &format!(".x {{@media (width <= 739px) {{{expected}}}}}"),
            font_config(),
        );
    }
    assert_css(
        ".x {@fontsize body desktop}",
        ".x {@media (width >= 1024px) {font-size:24px;line-height:1.4}}",
        font_config(),
    );
}

#[test]
fn literal_slash_keys_win_and_modifiers_keep_object_properties() {
    for (query, size, height) in [
        ("heading/large", "40px", ""),
        ("heading/large(1.5)", "60px", ""),
        ("heading/large(1.5)/2", "60px", "line-height:2;"),
    ] {
        assert_css(&format!(".x {{@fontsize {query} mobile}}"), &format!(".x {{font-family:Inter,sans-serif;line-height:1.1;@media (width <= 739px) {{font-size:{size};font-weight:600;{height}}}}}"), font_config());
    }
}

#[test]
fn dpx_font_sizes_and_line_heights_convert_together() {
    assert_css(".x {@fontsize 40dpx/50dpx mobile}", ".x {@media (width <= 739px) {font-size:calc(4vw * var(--ec-zoom));line-height:calc(5vw * var(--ec-zoom))}}", font_config());
    assert_css(".x {@fontsize 4vw/5vw mobile}", ".x {@media (width <= 739px) {font-size:calc(4vw * var(--ec-zoom));line-height:calc(5vw * var(--ec-zoom))}}", font_config());
    let mut cfg = font_config();
    cfg["setMaxForVw"] = json!(true);
    assert_css(
        ".x {@fontsize 4vw/5vw desktop}",
        ".x {@media (width >= 1024px) {font-size:48px;line-height:60px}}",
        cfg,
    );
}

#[test]
fn object_properties_and_modifiers_use_reference_viewports() {
    let mut cfg = font_config();
    cfg["dpxViewportSizes"] = json!({"mobile":400, "$sm":800});
    cfg["theme"]["typography"]["sizes"]["scaled"] =
        json!({"*":{"font-size":"20dpx","line-height":"24dpx","letter-spacing":"-1dpx"}});
    assert_css(".x {@fontsize scaled(2) mobile}", ".x {@media (width <= 739px) {font-size:calc(10vw * var(--ec-zoom));line-height:calc(6vw * var(--ec-zoom));letter-spacing:calc(-0.25vw * var(--ec-zoom))}}", cfg);
}

#[test]
fn base_properties_stay_before_responsive_overrides_and_later_authored_values() {
    assert_css(".x {@fontsize heading/large;line-height:normal}", ".x {font-family:Inter,sans-serif;line-height:1.1;@media (width <= 739px) {font-size:40px;font-weight:600} @media (width >= 740px) and (width <= 1023px) {font-size:40px;font-weight:600} @media (width >= 1024px) {font-size:60px;font-weight:700} line-height:normal}", font_config());
    assert_css(".x {@responsive mobile {@font sans body}}", ".x {@media (width <= 739px) {font-family:Inter,sans-serif;font-size:20px;line-height:1.5}}", font_config());
}

#[test]
fn between_font_sizes_use_the_shared_fluid_formula() {
    assert_css(".x {@fontsize between(20px-40px)/1.3 tablet}", ".x {@media (width >= 740px) and (width <= 1023px) {font-size:calc(20px + 20 * ((100vw - 740px) / 283));line-height:1.3}}", font_config());
}

#[test]
fn invalid_font_queries_fail_at_the_directive() {
    for query in [
        "missing",
        "body(0)",
        "body(NaN)",
        "body/",
        "40dpx/5vw",
        "body/invalid",
        "10",
        "nested/typo",
    ] {
        let source = format!(".x {{\n @fontsize {query} mobile;\n}}");
        let error = compile(&request(&source, font_config())).unwrap_err();
        assert_eq!(
            (error.code.as_str(), error.line),
            ("EU_SIZE", 2),
            "{query}: {error}"
        );
    }
    assert_eq!(
        compile(&request(
            ".x {@responsive mobile {@fontsize body desktop}}",
            font_config()
        ))
        .unwrap_err()
        .code,
        "EU_RESPONSIVE"
    );
}
