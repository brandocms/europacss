mod support;
use europacss::{compile, compile_frontend};
use serde_json::json;
use support::{assert_css, config, request};

#[test]
fn repeated_generated_values_share_contiguous_conditions() {
    let mut cfg = config();
    cfg["theme"]["spacing"] = json!({"gap":{"mobile":"12px","tablet":"12px","desktop":"24px"}});
    assert_css(".card{@space padding gap;}", ".card { @media (width < 740px), (width >= 740px) and (width < 1024px) {padding:12px} @media (width >= 1024px) {padding:24px} }", cfg.clone());
    let result = compile(&request(".card{@space padding gap;}", cfg.clone())).unwrap();
    assert_eq!(result.css.matches("padding:12px").count(), 1);
    assert!(!result.css.contains("739px"));
    assert!(result.css.contains("740px"));
    let frontend = compile_frontend(&request(".card{@space padding gap;}", cfg)).unwrap();
    assert_eq!(
        frontend.css.matches("padding: 12px").count(),
        2,
        "The raw frontend remains available for rule debugging"
    );
}

#[test]
fn adjacent_identical_conditions_combine_without_reordering_declarations() {
    assert_css(
        ".card { @responsive mobile {color:red} @mq mobile {color:blue; &:hover {color:green}} }",
        ".card { @media (width < 740px) {color:red; color:blue; &:hover{color:green}} }",
        config(),
    );
    let result = compile(&request(
        "@media print {.a{color:red}} @media print {.b{color:blue}}",
        config(),
    ))
    .unwrap();
    assert_eq!(result.css.matches("@media print").count(), 1);
    assert!(result.css.find(".a").unwrap() < result.css.find(".b").unwrap());
}

#[test]
fn intervening_rules_and_scope_boundaries_prevent_combining() {
    let source = ".card { @media print {color:red} color:green; @media print {color:blue} }";
    let result = compile(&request(source, config())).unwrap();
    assert_eq!(result.css.matches("@media print").count(), 2);
    assert!(result.css.find("green").unwrap() > result.css.find("red").unwrap());
    assert!(result.css.find("green").unwrap() < result.css.find("#00f").unwrap());
    let source = "@layer a {@media print {.x{color:red}}} @layer b {@media print {.x{color:red}}}";
    let result = compile(&request(source, config())).unwrap();
    assert_eq!(result.css.matches("@media print").count(), 2);
    assert!(result.css.contains("@layer a"));
    assert!(result.css.contains("@layer b"));
    let source = "@media print {@layer a {.x{color:red}}} @media screen {@layer a {.x{color:red}}}";
    let result = compile(&request(source, config())).unwrap();
    assert_eq!(
        result.css.matches("@layer a").count(),
        2,
        "Layer ordering is outside this optimization's scope"
    );
}

#[test]
fn merged_media_retain_each_distinct_rules_source_mapping() {
    let source = "@media print {\n .a{color:red}\n}\n@media print {\n .b{color:blue}\n}";
    let mut req = request(source, config());
    req.minify = false;
    let result = compile(&req).unwrap();
    let generated = result
        .css
        .lines()
        .position(|line| line.contains(".b"))
        .unwrap();
    let mut map =
        parcel_sourcemap::SourceMap::from_json("/", result.map.as_ref().unwrap()).unwrap();
    let origin = map
        .find_closest_mapping(generated as u32, 2)
        .unwrap()
        .original
        .unwrap();
    assert_eq!((origin.original_line, origin.original_column), (4, 1));
}

#[test]
fn repeated_queries_can_cross_proven_disjoint_widths_in_one_scope() {
    let mut cfg = config();
    cfg["theme"]["spacing"] = json!({"gap":{"mobile":"12px","tablet":"20px","desktop":"24px"}});
    let source = ".card{@space padding gap;@space margin gap;}";
    let expected = ".card{@media (width < 740px){padding:12px;margin:12px}@media (width >= 740px) and (width < 1024px){padding:20px;margin:20px}@media (width >= 1024px){padding:24px;margin:24px}}";
    assert_css(source, expected, cfg.clone());
    let result = compile(&request(source, cfg)).unwrap();
    assert_eq!(result.css.matches("@media").count(), 3);
    assert_eq!(result.css.matches(".card").count(), 3);
    assert_css("@media (width < 740px), (width >= 1024px){.a{color:red}} @media (width >= 740px) and (width < 1024px){.b{color:blue}} @media (width < 740px), (width >= 1024px){.c{color:green}}", "@media (width < 740px), (width >= 1024px){.a{color:red}.c{color:green}} @media (width >= 740px) and (width < 1024px){.b{color:blue}}", config());
}

#[test]
fn overlap_inclusive_endpoints_and_unproven_conditions_block_movement() {
    for middle in [
        "(width >= 500px)",
        "(width >= 739px)",
        "(width >= 740px), (width <= 100px)",
        "(height >= 1000px)",
        "(width >= 740px) and (orientation: landscape)",
        "print",
        "(width < 100px)",
    ] {
        let source = format!("@media (width <= 739px){{.a{{color:red}}}} @media {middle}{{.b{{color:blue}}}} @media (width <= 739px){{.c{{color:green}}}}");
        let result = compile(&request(&source, config())).unwrap();
        assert_eq!(
            result.css.matches("@media").count(),
            3,
            "{middle}: {}",
            result.css
        );
        assert!(result.css.find(".a").unwrap() < result.css.find(".b").unwrap());
        assert!(result.css.find(".b").unwrap() < result.css.find(".c").unwrap());
    }
}

#[test]
fn disjoint_packing_keeps_later_rule_source_origins() {
    let source = "@media (width <= 739px) { .a{color:red} }\n@media (width >= 740px) { .b{color:blue} }\n@media (width <= 739px) { .c{color:green} }";
    let mut req = request(source, config());
    req.minify = false;
    let result = compile(&req).unwrap();
    assert_eq!(result.css.matches("@media").count(), 2);
    let generated = result
        .css
        .lines()
        .position(|line| line.contains(".c"))
        .unwrap();
    let mut map =
        parcel_sourcemap::SourceMap::from_json("/", result.map.as_ref().unwrap()).unwrap();
    let origin = map
        .find_closest_mapping(generated as u32, 2)
        .unwrap()
        .original
        .unwrap();
    assert_eq!(origin.original_line, 2);
}

#[test]
fn open_endpoints_allow_disjoint_packing_but_closed_endpoints_still_overlap() {
    for (upper, count) in [("<", 2), ("<=", 3)] {
        let source=format!("@media (width {upper} 740px){{.a{{color:red}}}} @media (width >= 740px){{.b{{color:blue}}}} @media (width {upper} 740px){{.c{{color:green}}}}");
        assert_eq!(
            compile(&request(&source, config()))
                .unwrap()
                .css
                .matches("@media")
                .count(),
            count
        );
    }
    assert_css(
        "@media (width <= 739px){.x{color:red}} @media (width >= 740px){.x{color:red}}",
        "@media (width <= 739px),(width >= 740px){.x{color:red}}",
        config(),
    );
}
