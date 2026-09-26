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
            &format!(".x {{@media (width < 740px) {{{expected}}}}}"),
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
        assert_css(&format!(".x {{@fontsize {query} mobile}}"), &format!(".x {{font-family:Inter,sans-serif;line-height:1.1;@media (width < 740px) {{font-size:{size};font-weight:600;{height}}}}}"), font_config());
    }
}

#[test]
fn dpx_font_sizes_and_line_heights_convert_together() {
    assert_css(".x {@fontsize 40dpx/50dpx mobile}", ".x {@media (width < 740px) {font-size:calc(4vw * var(--ec-zoom));line-height:calc(5vw * var(--ec-zoom))}}", font_config());
    assert_css(".x {@fontsize 4vw/5vw mobile}", ".x {@media (width < 740px) {font-size:calc(4vw * var(--ec-zoom));line-height:calc(5vw * var(--ec-zoom))}}", font_config());
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
    assert_css(".x {@fontsize scaled(2) mobile}", ".x {@media (width < 740px) {font-size:calc(10vw * var(--ec-zoom));line-height:calc(6vw * var(--ec-zoom));letter-spacing:calc(-0.25vw * var(--ec-zoom))}}", cfg);
}

#[test]
fn base_properties_stay_before_responsive_overrides_and_later_authored_values() {
    assert_css(".x {@fontsize heading/large;line-height:normal}", ".x {font-family:Inter,sans-serif;line-height:1.1;@media (width < 740px) {font-size:40px;font-weight:600} @media (width >= 740px) and (width < 1024px) {font-size:40px;font-weight:600} @media (width >= 1024px) {font-size:60px;font-weight:700} line-height:normal}", font_config());
    assert_css(
        ".x {@responsive mobile {@font sans body}}",
        ".x {@media (width < 740px) {font-family:Inter,sans-serif;font-size:20px;line-height:1.5}}",
        font_config(),
    );
}

#[test]
fn between_font_sizes_use_the_shared_fluid_formula() {
    assert_css(".x {@fontsize between(20px-40px)/1.3 tablet}", ".x {@media (width >= 740px) and (width < 1024px) {font-size:calc(20px + 20 * ((100vw - 740px) / 283));line-height:1.3}}", font_config());
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

#[test]
fn font_families_cover_defaults_hierarchical_paths_and_literal_key_precedence() {
    assert_css(
        "article{@font serif;}",
        "article{font-family:Georgia,Cambria,'Times New Roman',Times,serif}",
        config(),
    );
    assert_css("article{@responsive mobile{@font serif;}}", "article{@media (width < 740px){font-family:Georgia,Cambria,'Times New Roman',Times,serif}}", config());
    let mut cfg = font_config();
    cfg["theme"]["typography"]["families"] = json!({"body":{"regular":["Helvetica","Arial","sans-serif"],"strong":["Helvetica Neue","Arial","sans-serif"]},"header/display":["Georgia","Times","serif"]});
    assert_css("article{@font body/regular;} strong{@font body/strong;} h1{@font header/display;}", "article{font-family:Helvetica,Arial,sans-serif} strong{font-family:Helvetica Neue,Arial,sans-serif} h1{font-family:Georgia,Times,serif}", cfg.clone());
    cfg["theme"]["typography"]["families"]["body/regular"] = json!(["Inter", "sans-serif"]);
    assert_css(
        "article{@font body/regular;}",
        "article{font-family:Inter,sans-serif}",
        cfg,
    );
}

#[test]
fn font_combines_family_sizes_modifiers_and_queries_in_source_order() {
    assert_css("article{@font sans body;}", "article{font-family:Inter,sans-serif;@media (width < 740px){font-size:20px;line-height:1.5}@media (width >= 740px) and (width < 1024px){font-size:20px;line-height:1.5}@media (width >= 1024px){font-size:24px;line-height:1.4}}", font_config());
    assert_css("article{@font sans body/1.53 desktop;@font sans body(1.2)/1.53 <=tablet;}", "article{font-family:Inter,sans-serif;@media (width >= 1024px){font-size:24px;line-height:1.53}font-family:Inter,sans-serif;@media (width < 740px){font-size:24px;line-height:1.53}@media (width >= 740px) and (width < 1024px){font-size:24px;line-height:1.53}}", font_config());
    assert_css("article{@font sans 18px/1.25 >=desktop;}", "article{font-family:Inter,sans-serif;@media (width >= 1024px){font-size:18px;line-height:1.25}}", font_config());
    assert_css(
        "article{@font sans nested/small mobile;}",
        "article{font-family:Inter,sans-serif;@media (width < 740px){font-size:12px}}",
        font_config(),
    );
}

#[test]
fn font_rejects_missing_family_bad_config_types_and_conflicting_queries() {
    for source in [
        "@font sans;",
        ".x{@font;}",
        ".x{@font missing;}",
        ".x{@font sans body desktop extra;}",
        ".x{@responsive mobile{@font sans body tablet;}}",
    ] {
        assert!(
            compile(&request(source, font_config())).is_err(),
            "{source}"
        );
    }
    let mut cfg = font_config();
    cfg["theme"]["typography"]["families"]["sans"] = json!({"bad":"Inter"});
    assert_eq!(
        compile(&request(".x{@font sans;}", cfg)).unwrap_err().code,
        "EU_CONFIG"
    );
}

#[test]
fn wildcard_fonts_convert_both_sizes_and_heights_at_each_breakpoint() {
    let mut cfg = font_config();
    cfg["theme"]["typography"]["sizes"] = json!({
        "mixed":{"mobile":"8vw/12vw","*":"4vw/1.2"},
        "all":{"*":"3vw"},
        "override":{"*":"4vw","desktop":"3.5vw"}
    });
    for (name, mobile, tablet, desktop) in [
        (
            "mixed",
            "font-size:calc(8vw * var(--ec-zoom));line-height:calc(12vw * var(--ec-zoom))",
            "font-size:calc(4vw * var(--ec-zoom));line-height:1.2",
            "font-size:calc(4vw * var(--ec-zoom));line-height:1.2",
        ),
        (
            "all",
            "font-size:calc(3vw * var(--ec-zoom))",
            "font-size:calc(3vw * var(--ec-zoom))",
            "font-size:calc(3vw * var(--ec-zoom))",
        ),
        (
            "override",
            "font-size:calc(4vw * var(--ec-zoom))",
            "font-size:calc(4vw * var(--ec-zoom))",
            "font-size:calc(3.5vw * var(--ec-zoom))",
        ),
    ] {
        assert_css(&format!("article{{@fontsize {name};}}"), &format!("article{{@media (width < 740px){{{mobile}}}@media (width >= 740px) and (width < 1024px){{{tablet}}}@media (width >= 1024px){{{desktop}}}}}"), cfg.clone());
    }
    cfg["setMaxForVw"] = true.into();
    assert_css(
        "article{@fontsize mixed $lg;}",
        "article{@media (width >= 1024px){font-size:48px;line-height:1.2}}",
        cfg.clone(),
    );
    assert_css("article{@fontsize 4vw/5vw;}", "article{@media (width < 740px){font-size:calc(4vw * var(--ec-zoom));line-height:calc(5vw * var(--ec-zoom))}@media (width >= 740px) and (width < 1024px){font-size:calc(4vw * var(--ec-zoom));line-height:calc(5vw * var(--ec-zoom))}@media (width >= 1024px){font-size:48px;line-height:60px}}", cfg);
}

#[test]
fn design_pixel_font_references_apply_to_collections_and_responsive_parents() {
    let mut cfg = font_config();
    cfg["dpxViewportSizes"] = json!({"mobile":400,"$sm":800});
    cfg["setMaxForVw"] = true.into();
    cfg["theme"]["typography"]["sizes"]["design"] = json!({"*":"40dpx/48dpx"});
    let expected = "article{@media (width < 740px){font-size:calc(10vw * var(--ec-zoom));line-height:calc(12vw * var(--ec-zoom))}@media (width >= 740px) and (width < 1024px){font-size:calc(5vw * var(--ec-zoom));line-height:calc(6vw * var(--ec-zoom))}@media (width >= 1024px){font-size:48px;line-height:57.599999999999994px}}";
    assert_css("article{@fontsize design;}", expected, cfg.clone());
    assert_css(
        "article{@fontsize design mobile;@fontsize design tablet;@fontsize design desktop;}",
        expected,
        cfg.clone(),
    );
    assert_css("article{@responsive tablet{@fontsize design;}}", "article{@media (width >= 740px) and (width < 1024px){font-size:calc(5vw * var(--ec-zoom));line-height:calc(6vw * var(--ec-zoom))}}", cfg.clone());
    // Sorting breakpoint widths, rather than their config order, determines the cap.
    cfg["theme"]["breakpoints"] = json!({"desktop":"1024px","mobile":"0","tablet":"740px"});
    assert_css("article{@fontsize design;}", expected, cfg);
}

#[test]
fn data_references_replace_base_callbacks_and_keep_breakpoint_overrides() {
    let mut cfg = font_config();
    cfg["theme"]["colors"] = json!({"ink":"#123456"});
    cfg["theme"]["typography"]["families"]["brand"] = json!({"regular":["Inter","sans-serif"]});
    cfg["theme"]["typography"]["sizes"]["referenced"] = json!({
        "__base__":{"font-family":"{typography.families.brand.regular}","color":"{colors.ink}","line-height":"135%","letter-spacing":"-.02em"},
        "mobile":{"font-size":"20px"},
        "tablet":{"font-size":"25px","line-height":"140%"},
        "desktop":"30px"
    });
    let base = "font-family:Inter,sans-serif;color:#123456;line-height:135%;letter-spacing:-.02em;";
    assert_css("h2{@fontsize referenced;line-height:normal;}", &format!("h2{{{base}@media (width < 740px){{font-size:20px}}@media (width >= 740px) and (width < 1024px){{font-size:25px;line-height:140%}}@media (width >= 1024px){{font-size:30px}}line-height:normal;}}"), cfg.clone());
    assert_css("h2{@fontsize referenced tablet;}", &format!("h2{{{base}@media (width >= 740px) and (width < 1024px){{font-size:25px;line-height:140%}}}}"), cfg.clone());
    assert_css("h2{@responsive tablet{@fontsize referenced;}}", &format!("h2{{@media (width >= 740px) and (width < 1024px){{{base}font-size:25px;line-height:140%}}}}"), cfg.clone());
    cfg["theme"]["typography"]["families"]["brand"]["regular"] = "Inter, sans-serif".into();
    assert_css(
        "h2{@fontsize referenced mobile;}",
        &format!("h2{{{base}@media (width < 740px){{font-size:20px}}}}"),
        cfg,
    );
}

#[test]
fn fluid_fonts_and_mixed_literal_sizes_keep_native_nesting_and_source_order() {
    let mut cfg = font_config();
    cfg["theme"]["typography"]["sizes"]["fluid"] = json!({"*":"between(20px-30px)"});
    cfg["theme"]["typography"]["sizes"]["object"] = json!({"mobile":{"font-size":"17px","line-height":"24px","letter-spacing":".98px"},"tablet":"19px"});
    assert_css("article{@fontsize object mobile;@fontsize object tablet;}", "article{@media (width < 740px){font-size:17px;line-height:24px;letter-spacing:.98px}@media (width >= 740px) and (width < 1024px){font-size:19px}}", cfg.clone());
    for (query, suffix) in [("fluid", ""), ("fluid/1.4", "line-height:1.4;")] {
        assert_css(&format!("article{{@fontsize {query} tablet;}}"), &format!("article{{@media (width >= 740px) and (width < 1024px){{font-size:calc(20px + 10 * ((100vw - 740px) / 283));{suffix}}}}}"), cfg.clone());
    }
    assert_css("article{@fontsize fluid(2) tablet;}", "article{@media (width >= 740px) and (width < 1024px){font-size:calc((20px + 10 * ((100vw - 740px) / 283)) * 2)}}", cfg.clone());
    assert_css(".article, #featured{> .text{@fontsize body mobile;@fontsize 18px;[data-large] &{@font sans 24px;@responsive tablet{@fontsize 20px;}}}}", ".article, #featured{> .text{@media (width < 740px){font-size:20px;line-height:1.5}font-size:18px;[data-large] &{font-family:Inter,sans-serif;font-size:24px;@media (width >= 740px) and (width < 1024px){font-size:20px}}}}", cfg);
}

#[test]
fn invalid_font_base_properties_and_viewport_caps_report_the_directive() {
    for base in [
        json!("bad"),
        json!({"color":["red","blue"]}),
        json!({"font-size":null}),
        json!({"font-size":{"nested":"20px"}}),
        json!({"@media":"all"}),
        json!({"color":"red;display:none"}),
    ] {
        let mut cfg = font_config();
        cfg["theme"]["typography"]["sizes"]["broken"] = json!({"__base__":base,"*":"20px"});
        let error = compile(&request(".x{\n @fontsize broken;\n}", cfg)).unwrap_err();
        assert_eq!((error.code.as_str(), error.line), ("EU_CONFIG", 2));
    }
    let mut cfg = font_config();
    cfg["setMaxForVw"] = true.into();
    cfg["theme"]["container"]["maxWidth"]["desktop"] = "100%".into();
    let error = compile(&request(".x{\n @fontsize 4vw desktop;\n}", cfg)).unwrap_err();
    assert_eq!((error.code.as_str(), error.line), ("EU_SIZE", 2));
    for source in [
        "@fontsize body;",
        ".x{@fontsize body {color:red;}}",
        ".x{@fontsize body desktop extra;}",
    ] {
        assert!(
            compile(&request(source, font_config())).is_err(),
            "{source}"
        );
    }
}
