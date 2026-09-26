mod support;
use europacss::{compile, compile_frontend};
use serde_json::{json, Value};
use support::{assert_css, config, request};

fn sizes_config() -> Value {
    let mut cfg = config();
    cfg["dpxViewportSize"] = json!(1000);
    cfg["theme"]["columns"] = json!({"gutters":{"mobile":"20px","tablet":"30px","desktop":"50px"}});
    cfg["theme"]["container"] = json!({"padding":{"mobile":"15px","tablet":"35px","desktop":"50px"},"maxWidth":{"mobile":"100%","tablet":"100%","desktop":"1200px"}});
    cfg["theme"]["spacing"] = json!({
        "md":{"mobile":"25px","tablet":"50px","desktop":"75px"},
        "wild":{"*":"10px","desktop":"30px"},
        "nested":{"small":{"*":"12px"}}, "literal/slash":"18px", "with-hyphen":"7px"
    });
    cfg
}

#[test]
fn spacing_literals_tokens_and_arithmetic() {
    for (value, expected) in [
        ("2", "40px"),
        ("-0.5", "-10px"),
        ("0", "0"),
        ("auto", "auto"),
        ("md", "25px"),
        ("-md", "-25px"),
        ("md*2", "50px"),
        ("md/2", "12.5px"),
        ("wild", "10px"),
        ("nested/small", "12px"),
        ("literal/slash", "18px"),
        ("with-hyphen", "7px"),
        ("2.5rem*2", "5rem"),
        ("1e2px", "100px"),
        ("container", "15px"),
        ("container/2", "7.5px"),
        ("-container/2", "-7.5px"),
        ("3/4", "calc(75% - 5px)"),
        ("3:1/4", "calc(75% + 15px)"),
        ("3:0.5/4", "calc(75% + 5px)"),
        ("6:-1/12", "calc(50% - 30px)"),
        ("2/10:1", "calc(20% - 20px)"),
        ("2:1/10:1", "20%"),
        ("10/10:1", "calc(100% - 20px)"),
        ("10:1/10:1", "100%"),
    ] {
        assert_css(
            &format!(".x {{@space width {value} mobile}}"),
            &format!(".x {{@media (width <= 739px) {{width:{expected}}}}}"),
            sizes_config(),
        );
    }
}

#[test]
fn native_values_do_not_generate_unnecessary_media_rules() {
    for value in [
        "20px",
        "1rem",
        "2vh",
        "1lh",
        "1svh",
        "1lvh",
        "1dvh",
        "10%",
        "calc(100% - 2px)",
        "var(--gap, 10px)",
        "clamp(10px, 2vw, 30px)",
    ] {
        assert_css(
            &format!(".x {{@space margin-top {value}}}"),
            &format!(".x {{margin-top:{value}}}"),
            sizes_config(),
        );
    }
}

#[test]
fn dpx_and_viewport_maximums_use_breakpoint_context() {
    let mut cfg = sizes_config();
    cfg["setMaxForVw"] = json!(true);
    cfg["dpxViewportSizes"] = json!({"mobile":400, "$sm":800});
    assert_css(".x {@space padding-top 40dpx}", ".x {@media (width <= 739px) {padding-top:calc(10vw * var(--ec-zoom))} @media (width >= 740px) and (width <= 1023px) {padding-top:calc(5vw * var(--ec-zoom))} @media (width >= 1024px) {padding-top:48px}}", cfg.clone());
    assert_css(
        ".x {@space padding-top 5vw desktop}",
        ".x {@media (width >= 1024px) {padding-top:60px}}",
        cfg,
    );
}

#[test]
fn calc_references_preserve_grouping_and_convert_only_dimension_tokens() {
    let mut cfg = sizes_config();
    cfg["theme"]["columns"]["gutters"]["mobile"] = json!("20dpx");
    assert_css(".x {@space width calc(100vw - var[3/4] + 10dpx) mobile}", ".x {@media (width <= 739px) {width:calc(100vw - calc(75% - calc(calc(2vw * var(--ec-zoom)) * 0.25)) + calc(1vw * var(--ec-zoom)))}}", cfg);
    assert_css(
        ".x {@space width var(--named-dpx, 10px)}",
        ".x {width:var(--named-dpx, 10px)}",
        sizes_config(),
    );
}

#[test]
fn container_values_and_dynamic_padding_keep_later_overrides() {
    assert_css(".x {@space container mobile; padding-left:9px}", ".x {@media (width <= 739px) {padding-left:15px;padding-right:15px;max-width:100%;margin-left:auto;margin-right:auto;width:100%} padding-left:9px}", sizes_config());
    let mut cfg = sizes_config();
    cfg["theme"]["container"]["padding"]["desktop"] = json!("* 30dpx");
    assert_css(".x {@space! container desktop}", ".x {@media (width >= 1024px) {padding-left:max(calc(3vw * var(--ec-zoom)), calc((100vw - 1200px) / 2))!important;padding-right:max(calc(3vw * var(--ec-zoom)), calc((100vw - 1200px) / 2))!important;margin-left:0!important;margin-right:0!important;width:100vw!important}}", cfg.clone());
    assert_css(".x {@space margin-left -container/2 desktop}", ".x {@media (width >= 1024px) {margin-left:calc(calc(max(calc(3vw * var(--ec-zoom)), calc((100vw - 1200px) / 2)) * 0.5) * -1)}}", cfg);
}

#[test]
fn shortcuts_and_negate_preserve_values_and_importance() {
    assert_css(".x {@space! breakout; @space translateX 12px; @column-offset md mobile}", ".x {width:100vw!important;margin-left:calc(50% - 50vw)!important;transform:translateX(12px);@media (width <= 739px) {margin-left:25px}}", sizes_config());
    for (query, expected) in [
        ("negate(md, 30px)", "5px"),
        ("negate(md, md+10px)", "10px"),
        ("negate(md, md-2vw)", "-2vw"),
        ("negate(with-hyphen, 10px)", "3px"),
    ] {
        assert_css(
            &format!(".x {{@space! {query} mobile}}"),
            &format!(".x {{@media (width <= 739px) {{margin-top:{expected}!important}}}}"),
            sizes_config(),
        );
    }
}

#[test]
fn fluid_and_vertical_rhythm_sizes_have_valid_units() {
    let mut cfg = sizes_config();
    cfg["theme"]["typography"] =
        json!({"rootSize":"16px","lineHeight":{"*":1.5},"sizes":{"base":{"*":"20px"}}});
    assert_css(".x {@space margin-top between(20px-40px) tablet}", ".x {@media (width >= 740px) and (width <= 1023px) {margin-top:calc(20px + 20 * ((100vw - 740px) / 283))}}", cfg.clone());
    assert_css(".x {@space margin-top between(1rem-2rem) tablet}", ".x {@media (width >= 740px) and (width <= 1023px) {margin-top:calc(1rem + ((100vw - 46.25rem) / 17.6875))}}", cfg.clone());
    assert_css(
        ".x {@space margin-top vertical-rhythm(theme.typography.sizes.base) mobile}",
        ".x {@media (width <= 739px) {margin-top:30px}}",
        cfg,
    );
}

#[test]
fn scoped_queries_and_custom_ranges_keep_responsive_sizes_inside_scope() {
    assert_css("@layer ui {.x {@responsive mobile {@space padding-x md} @space width md 400px->900px}}", "@layer ui {.x {@media (width <= 739px) {padding-left:25px;padding-right:25px} @media (width >= 400px) and (width <= 900px) {@media (width <= 739px) {width:25px} @media (width >= 740px) and (width <= 1023px) {width:50px} @media (width >= 1024px) {width:75px}}}}", sizes_config());
}

#[test]
fn grid_and_column_rules_share_spacing_calculations() {
    assert_css(".x {@responsive mobile {@grid; @column 3:1/4}}", ".x {@media (width <= 739px) {display:grid;grid-template-columns:repeat(12,1fr);grid-column-gap:20px;position:relative;flex-grow:0;flex-shrink:0;flex-basis:calc(75% + 15px);max-width:calc(75% + 15px)}}", sizes_config());
    let mut cfg = sizes_config();
    cfg["theme"]["columns"]["gutters"]["mobile"] = json!("2vw");
    assert_css(".x {@column 3/4 mobile}", ".x {@media (width <= 739px) {position:relative;flex-grow:0;flex-shrink:0;flex-basis:calc(75% - 0.5vw);max-width:calc(75% - 0.502vw)}}", cfg);
}

#[test]
fn invalid_sizes_and_recursive_tokens_fail_explicitly() {
    let mut cfg = sizes_config();
    cfg["theme"]["spacing"]["cycle"] = json!("cycle");
    for value in [
        "missing",
        "md/0",
        "1/0",
        "3/2",
        "4:1/4",
        "cycle",
        "between(10px-2rem)",
        "20nonsense",
        "calc(var[missing])",
    ] {
        let error = compile(&request(
            &format!(".x {{\n @space width {value} mobile;\n}}"),
            cfg.clone(),
        ))
        .unwrap_err();
        assert_eq!(
            (error.code.as_str(), error.line),
            ("EU_SIZE", 2),
            "{value}: {error}"
        );
    }
    assert_eq!(
        compile(&request(".x {@row}", cfg.clone()))
            .unwrap_err()
            .code,
        "EU_DEPRECATED"
    );
    assert_eq!(
        compile_frontend(&request(
            ".x {@responsive mobile {@column 1/2 desktop}}",
            cfg
        ))
        .unwrap_err()
        .code,
        "EU_RESPONSIVE"
    );
}
