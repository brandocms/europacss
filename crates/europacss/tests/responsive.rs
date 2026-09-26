mod support;
use europacss::{compile, compile_frontend};
use serde_json::json;
use support::{assert_css, config, request};

#[test]
fn named_collections_comparisons_lists_and_arrow_queries() {
    let config = json!({"theme": {
        "breakpoints":{"xs":"0", "sm":"740px", "md":"1024px", "lg":"1399px", "xl":"1900px"},
        "breakpointCollections":{"$small":"xs/sm", "$large":">=lg", "$mixed":"$small/xl"}
    }});
    for (query, media) in [
        ("xs", "(width < 740px)"),
        ("<=sm", "(width < 1024px)"),
        ("xs/sm/xl", "(width < 1024px), (width >= 1900px)"),
        (">sm", "(width >= 1024px)"),
        (">=md", "(width >= 1024px)"),
        ("xl", "(width >= 1900px)"),
        ("$small", "(width < 1024px)"),
        ("$large", "(width >= 1399px)"),
        ("$mixed", "(width < 1024px), (width >= 1900px)"),
        ("359px->740px", "(width >= 359px) and (width <= 740px)"),
        ("500px->", "(width >= 500px)"),
        ("->800px", "(width <= 800px)"),
        ("<xs", "not all"),
    ] {
        for directive in ["responsive", "mq"] {
            assert_css(&format!(".card {{ color: red; @{directive} {query} {{ color: blue; font-size: 15px; }} color: green; }}"),
                &format!(".card {{ color: red; @media {media} {{ color: blue; font-size: 15px; }} color: green; }}"), config.clone());
        }
    }
}

#[test]
fn root_and_sibling_queries_keep_source_order() {
    assert_css("@responsive mobile { .one {color:red} .two{color:blue} } @mq tablet {.one{display:none}.two{display:none}} .last{color:green}",
        "@media (width < 740px) {.one{color:red}.two{color:blue}} @media (width >= 740px) and (width < 1024px) {.one{display:none}.two{display:none}} .last{color:green}", config());
    assert_css("article {width:90%; @responsive mobile/tablet {width:100%} @mq >tablet {width:80%} @responsive >=desktop {@display flex/row;} @responsive desktop {background:yellow} width:50%;}",
        "article {width:90%; @media (width < 1024px) {width:100%} @media (width >= 1024px) {width:80%} @media (width >= 1024px) {display:flex;flex-direction:row;} @media (width >= 1024px) {background:yellow} width:50%;}", config());
}

#[test]
fn nested_queries_intersect_and_do_not_leak_out_of_layers_or_supports() {
    assert_css("@layer components { @supports (display:grid) { .card { @responsive >=tablet {color:red; @mq <=tablet {color:blue; &:hover {@space padding 8px;}} color:green;} color:black;} } }",
        "@layer components { @supports (display:grid) { .card { @media (width >= 740px) {color:red; @media (width < 1024px) {color:blue; &:hover {padding:8px;}} color:green;} color:black;} } }", config());
    assert_css(
        ".card { @responsive mobile { @responsive desktop {color:red;} } }",
        ".card { @media (width < 740px) { @media (width >= 1024px) {color:red;} } }",
        config(),
    );
}

#[test]
fn responsive_values_use_the_innermost_query_with_outer_conditions_retained() {
    let mut cfg = config();
    cfg["theme"]["spacing"] = json!({"gap":{"mobile":"4px", "tablet":"8px", "desktop":"12px"}});
    assert_css(".card { @responsive >=tablet { @mq <=tablet { @space padding gap; } } }",
        ".card { @media (width >= 740px) { @media (width < 1024px) { @media (width < 740px) {padding:4px} @media (width >= 740px) and (width < 1024px) {padding:8px} } } }", cfg.clone());
    assert_css(".card { @responsive 700px->800px { @mq tablet { @space padding gap; } } }",
        ".card { @media (width >= 700px) and (width <= 800px) { @media (width >= 740px) and (width < 1024px) {padding:8px} } }", cfg.clone());
    assert_css(".card { @mq tablet { @responsive 700px->800px { @space padding gap; } } }",
        ".card { @media (width >= 740px) and (width < 1024px) { @media (width >= 700px) and (width <= 800px) { @media (width < 740px) {padding:4px} @media (width >= 740px) and (width < 1024px) {padding:8px} @media (width >= 1024px) {padding:12px} } } }", cfg);
}

#[test]
fn unpack_and_placeholders_can_expand_inside_responsive_blocks() {
    let mut cfg = config();
    cfg["theme"]["details"] = json!({"mobile":{"letter-spacing":"1px"}, "tablet":{"letter-spacing":"2px"}, "desktop":{"letter-spacing":"3px"}});
    assert_css("%details {@unpack theme.details;} .card { @responsive tablet { @extend %details; color:red; } }",
        ".card { @media (width >= 740px) and (width < 1024px) { @media (width < 740px) {letter-spacing:1px} @media (width >= 740px) and (width < 1024px) {letter-spacing:2px} @media (width >= 1024px) {letter-spacing:3px} color:red;} }", cfg);
}

#[test]
fn malformed_queries_and_explicit_child_queries_are_diagnostics() {
    for source in [
        "@responsive;",
        "@mq {}",
        "@mq mobile;",
        "@responsive mystery {.x{color:red}}",
        ".x{@mq 900px->400px {color:red}}",
        ".x{@responsive tablet {@space padding 1px desktop;}}",
        ".x{@mq tablet {@color fg red mobile;}}",
    ] {
        let error = compile(&request(source, config())).unwrap_err();
        assert!(
            matches!(
                error.code.as_str(),
                "EU_ARGUMENTS" | "EU_BREAKPOINT" | "EU_RESPONSIVE"
            ),
            "{source}: {error}"
        );
    }
    let source = ".x {\n @mq tablet {\n  @responsive mobile { color:red; }\n }\n}";
    let out = compile_frontend(&request(source, config())).unwrap();
    assert!(!out.css.contains("@mq"));
    assert!(!out.css.contains("@responsive"));
}

#[test]
fn fractional_breakpoints_partition_widths_without_gaps_or_shared_endpoints() {
    let cfg =
        json!({"theme":{"breakpoints":{"phone":"0","tablet":"739.5px","desktop":"1024.25px"}}});
    for (name, expected) in [
        ("phone", "(width < 739.5px)"),
        ("tablet", "(width >= 739.5px) and (width < 1024.25px)"),
        ("desktop", "(width >= 1024.25px)"),
        ("phone/tablet", "(width < 1024.25px)"),
        ("phone/desktop", "(width < 739.5px), (width >= 1024.25px)"),
    ] {
        let source = format!("@responsive {name} {{.x{{color:red}}}}");
        let frontend = compile_frontend(&request(&source, cfg.clone())).unwrap();
        assert!(frontend.css.contains(expected), "{}", frontend.css);
        for browsers in [
            vec!["chrome 100".into()],
            vec!["chrome 131, firefox 132, safari 18.2".into()],
        ] {
            let mut req = request(&source, cfg.clone());
            req.browsers = browsers;
            let actual = compile(&req).unwrap().css;
            req.source = format!("@media {expected} {{.x{{color:red}}}}");
            assert_eq!(actual, compile(&req).unwrap().css);
            assert!(!actual.contains("738.5px"));
        }
    }
    assert_css(
        "@mq 739.5px->1024.25px{.x{color:red}}",
        "@media (width >= 739.5px) and (width <= 1024.25px){.x{color:red}}",
        cfg,
    );
}
