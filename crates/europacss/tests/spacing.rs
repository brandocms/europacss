mod support;
use europacss::{compile, compile_frontend};
use serde_json::{json, Value};
use support::{assert_css, config, request};

fn spacing_config() -> Value {
    let mut cfg = config();
    cfg["dpxViewportSize"] = json!(1000);
    cfg["theme"]["columns"] = json!({"gutters":{"mobile":"20px","tablet":"30px","desktop":"50px"}});
    cfg["theme"]["container"] = json!({"padding":{"mobile":"15px","tablet":"35px","desktop":"50px"},"maxWidth":{"mobile":"100%","tablet":"100%","desktop":"1200px"}});
    cfg["theme"]["spacing"] = json!({
        "block":{"mobile":"20px","tablet":"30px","desktop":"40px"},
        "xs":{"mobile":"10px","tablet":"20px","desktop":"30px"},
        "nested":{"small":{"mobile":"10px","tablet":"20px","desktop":"30px"}},
        "wild":{"*":"25px","desktop":"75px"},
        "fluid":{"*":"between(100px-200px)"}
    });
    cfg
}

const CONDITIONS: [&str; 3] = [
    "(width <= 739px)",
    "(width >= 740px) and (width <= 1023px)",
    "(width >= 1024px)",
];

fn responsive(property: &str, values: [&str; 3], indices: &[usize]) -> String {
    indices
        .iter()
        .map(|&i| format!("@media {}{{{property}:{};}}", CONDITIONS[i], values[i]))
        .collect()
}

#[test]
fn responsive_spacing_tokens_gutter_multipliers_and_negatives() {
    for (value, expected) in [
        ("block", ["20px", "30px", "40px"]),
        ("nested/small", ["10px", "20px", "30px"]),
        ("wild", ["25px", "25px", "75px"]),
        ("block/2", ["10px", "15px", "20px"]),
        ("-block", ["-20px", "-30px", "-40px"]),
        ("block*-2", ["-40px", "-60px", "-80px"]),
        ("0.5", ["10px", "15px", "25px"]),
        ("1.5", ["30px", "45px", "75px"]),
        ("-2", ["-40px", "-60px", "-100px"]),
        (
            "1/4",
            [
                "calc(25% - 15px)",
                "calc(25% - 22.5px)",
                "calc(25% - 37.5px)",
            ],
        ),
        (
            "1:1/4",
            ["calc(25% + 5px)", "calc(25% + 7.5px)", "calc(25% + 12.5px)"],
        ),
    ] {
        for (query, indices) in [
            ("", &[0, 1, 2][..]),
            ("tablet", &[1][..]),
            ("<=tablet", &[0, 1][..]),
            ("mobile/desktop", &[0, 2][..]),
            ("$sm", &[0, 1][..]),
        ] {
            assert_css(
                &format!(".x{{@space margin-top {value} {query};}}"),
                &format!(".x{{{}}}", responsive("margin-top", expected, indices)),
                spacing_config(),
            );
        }
    }
}

#[test]
fn spacing_shortcuts_importance_and_native_values_do_not_gain_queries() {
    for (shortcut, properties) in [
        ("padding", &["padding"][..]),
        ("margin", &["margin"][..]),
        ("padding-x", &["padding-left", "padding-right"][..]),
        ("padding-y", &["padding-top", "padding-bottom"][..]),
        ("margin-x", &["margin-left", "margin-right"][..]),
        ("margin-y", &["margin-top", "margin-bottom"][..]),
    ] {
        for value in ["0", "20px", "-20px", "var(--gap)"] {
            for important in [false, true] {
                let suffix = if important { "!important" } else { "" };
                let flag = if important { "!" } else { "" };
                let declarations: String = properties
                    .iter()
                    .map(|p| format!("{p}:{value}{suffix};"))
                    .collect();
                assert_css(
                    &format!(".x{{@space{flag} {shortcut} {value};}}"),
                    &format!(".x{{{declarations}}}"),
                    spacing_config(),
                );
                assert_css(
                    &format!(".x{{@space{flag} {shortcut} {value} mobile;}}"),
                    &format!(".x{{@media (width <= 739px){{{declarations}}}}}"),
                    spacing_config(),
                );
            }
        }
    }
    for axis in ["X", "Y", "Z"] {
        assert_css(
            &format!(".x{{@space translate{axis} 12px;}}"),
            &format!(".x{{transform:translate{axis}(12px);}}"),
            spacing_config(),
        );
    }
    assert_css(
        ".x{@space margin-left -20vw;@space width auto;@space height theme(spacing.xs.mobile);}",
        ".x{margin-left:-20vw;width:auto;height:10px;}",
        spacing_config(),
    );
}

#[test]
fn calc_references_combine_container_gutter_and_design_pixels() {
    for property in ["width", "translateX"] {
        let values = ["calc(100vw + 5px)", "calc(100vw - 5px)", "100vw"];
        let expected: String = CONDITIONS
            .iter()
            .zip(values)
            .map(|(condition, value)| {
                let declaration = if property == "width" {
                    format!("width:{value}")
                } else {
                    format!("transform:translateX({value})")
                };
                format!("@media {condition}{{{declaration}}}")
            })
            .collect();
        assert_css(
            &format!(
                ".x{{@space {property} calc(100vw - var[container] + var[1]);font-size:18px;}}"
            ),
            &format!(".x{{{expected}font-size:18px;}}"),
            spacing_config(),
        );
    }
    let mut cfg = spacing_config();
    cfg["setMaxForVw"] = true.into();
    cfg["theme"]["columns"]["gutters"] =
        json!({"mobile":"20px","tablet":"30dpx","desktop":"50dpx"});
    cfg["theme"]["container"]["padding"] =
        json!({"mobile":"15px","tablet":"35dpx","desktop":"50dpx"});
    assert_css(".x{@space width calc(100vw - var[container] + var[1]);}", ".x{@media (width <= 739px){width:calc(100vw + 5px)}@media (width >= 740px) and (width <= 1023px){width:calc(100vw - calc(3.5vw * var(--ec-zoom)) + calc(3vw * var(--ec-zoom)))}@media (width >= 1024px){width:100vw}}", cfg.clone());
    assert_css(".x{@space width calc(100% - var[container] - var[2:1/12]) desktop;}", ".x{@media (width >= 1024px){width:calc(100% - 60px - (16.666666666666664% + 9.999999999999998px))}}", cfg.clone());
    assert_css(".x{@space padding-x .4;@space padding-y .4;}", ".x{@media (width <= 739px){padding-left:8px;padding-right:8px;padding-top:8px;padding-bottom:8px}@media (width >= 740px) and (width <= 1023px){padding-left:calc(1.2vw * var(--ec-zoom));padding-right:calc(1.2vw * var(--ec-zoom));padding-top:calc(1.2vw * var(--ec-zoom));padding-bottom:calc(1.2vw * var(--ec-zoom))}@media (width >= 1024px){padding-left:24px;padding-right:24px;padding-top:24px;padding-bottom:24px}}", cfg);
}

#[test]
fn viewport_spacing_caps_only_at_the_largest_breakpoint() {
    let mut cfg = spacing_config();
    cfg["setMaxForVw"] = true.into();
    cfg["theme"]["columns"]["gutters"] = json!({"*":"2vw"});
    for (query, expected) in [
        ("4vw", ["4vw", "4vw", "48px"]),
        ("2", ["4vw", "4vw", "48px"]),
        (
            "40dpx",
            [
                "calc(4vw * var(--ec-zoom))",
                "calc(4vw * var(--ec-zoom))",
                "48px",
            ],
        ),
    ] {
        assert_css(
            &format!(".x{{@space width {query};}}"),
            &format!(".x{{{}}}", responsive("width", expected, &[0, 1, 2])),
            cfg.clone(),
        );
    }
    cfg["setMaxForVw"] = false.into();
    assert_css(".x{@space width 4vw;}", ".x{width:4vw}", cfg);
}

#[test]
fn spacing_in_nested_selectors_and_responsive_scopes_keeps_later_overrides() {
    let values = ["40px", "60px", "100px"];
    assert_css(
        "article{display:flex;> *{@space margin-left 2;&:first-of-type{margin-left:0}}}",
        &format!(
            "article{{display:flex;> *{{{}&:first-of-type{{margin-left:0}}}}}}",
            responsive("margin-left", values, &[0, 1, 2])
        ),
        spacing_config(),
    );
    for (query, condition, indices) in [
        ("mobile", "(width <= 739px)", &[0][..]),
        (">=tablet", "(width >= 740px)", &[1, 2][..]),
        ("$sm", "(width <= 1023px)", &[0, 1][..]),
    ] {
        let declarations = if indices.len() == 1 {
            format!("margin-left:{};", values[indices[0]])
        } else {
            responsive("margin-left", values, indices)
        };
        assert_css(
            &format!(
                "@responsive {query}{{article{{> *{{@space margin-left 2;margin-left:9px;}}}}}}"
            ),
            &format!("@media {condition}{{article{{> *{{{declarations}margin-left:9px;}}}}}}"),
            spacing_config(),
        );
    }
}

#[test]
fn negate_and_breakout_queries_preserve_each_directives_position() {
    for (expression, values) in [
        ("negate(block, 25px)", ["5px", "-5px", "-15px"]),
        (
            "negate(block, xs)",
            [
                "calc(10px - 20px)",
                "calc(20px - 30px)",
                "calc(30px - 40px)",
            ],
        ),
        ("negate(block, block+xs)", ["10px", "20px", "30px"]),
        (
            "negate(block, block-2vw)",
            [
                "calc(calc(20px - 2vw) - 20px)",
                "calc(calc(30px - 2vw) - 30px)",
                "calc(calc(40px - 2vw) - 40px)",
            ],
        ),
    ] {
        for (query, indices) in [
            ("", &[0, 1, 2][..]),
            ("desktop", &[2][..]),
            (">=tablet", &[1, 2][..]),
            ("$sm", &[0, 1][..]),
        ] {
            assert_css(
                &format!(".x{{@space {expression} {query};margin-top:0;}}"),
                &format!(
                    ".x{{{}margin-top:0;}}",
                    responsive("margin-top", values, indices)
                ),
                spacing_config(),
            );
        }
    }
    for (query, condition) in [
        ("mobile", "(width <= 739px)"),
        (">=tablet", "(width >= 740px)"),
        ("$sm", "(width <= 1023px)"),
    ] {
        assert_css(&format!(".x{{@space! breakout {query};}}"), &format!(".x{{@media {condition}{{width:100vw!important;margin-left:calc(50% - 50vw)!important}}}}"), spacing_config());
        assert_css(
            &format!(".x{{@responsive {query}{{@space breakout;}}}}"),
            &format!(".x{{@media {condition}{{width:100vw;margin-left:calc(50% - 50vw)}}}}"),
            spacing_config(),
        );
    }
}

#[test]
fn fluid_spacing_and_rhythm_scale_the_whole_size() {
    let mut cfg = spacing_config();
    cfg["theme"]["typography"] = json!({"rootSize":"16px","lineHeight":{"*":1.6},"sizes":{"fluid":{"*":"between(18px-22px)"},"object":{"*":{"font-size":"between(18px-22px)","font-weight":700}}}});
    for (expression, expected) in [
        (
            "between(100px-200px)",
            "calc(100px + 100 * ((100vw - 320px) / 419))",
        ),
        (
            "fluid*2",
            "calc((100px + 100 * ((100vw - 320px) / 419)) * 2)",
        ),
        (
            "vertical-rhythm(theme.typography.sizes.fluid)",
            "calc((18px + 4 * ((100vw - 320px) / 419)) * 1.6)",
        ),
        (
            "vertical-rhythm(theme.typography.sizes.fluid, 1.2)",
            "calc((18px + 4 * ((100vw - 320px) / 419)) * 1.2)",
        ),
        (
            "vertical-rhythm(theme.typography.sizes.object, 1.2)",
            "calc((18px + 4 * ((100vw - 320px) / 419)) * 1.2)",
        ),
        ("between(20px-20px)", "20px"),
    ] {
        assert_css(
            &format!(".x{{@space margin-top {expression} mobile;}}"),
            &format!(".x{{@media (width <= 739px){{margin-top:{expected}}}}}"),
            cfg.clone(),
        );
    }
    assert_css(
        ".x{@space width between(20px-40px) desktop;}",
        ".x{@media (width >= 1024px){width:calc(20px + 20 * ((100vw - 1024px) / 200))}}",
        cfg,
    );
}

#[test]
fn invalid_spacing_does_not_leak_directives_or_drop_declarations() {
    for source in [
        "@space width 20px;",
        ".x{@space width;}",
        ".x{@space width 20px {color:red;}}",
        ".x{@responsive mobile{@space width 20px desktop;}}",
        ".x{@space negate(block);}",
        ".x{@space negate(block,);}",
        ".x{@space width vertical-rhythm(missing) mobile;}",
        ".x{@space width vertical-rhythm(theme.typography.sizes.xl, -1) mobile;}",
        ".x{@space width between(10px-20vw) mobile;}",
    ] {
        assert!(
            compile(&request(source, spacing_config())).is_err(),
            "{source}"
        );
    }
    let output = compile_frontend(&request(
        ".x{@space width 10px;@space width 20px;}",
        spacing_config(),
    ))
    .unwrap();
    assert!(output.css.find("width: 10px").unwrap() < output.css.find("width: 20px").unwrap());
}

#[test]
fn negate_values_resolve_the_whole_width_and_preserve_gap_shorthand() {
    for (value, expected) in [
        ("negate(1/4)", "calc((25% - 15px) * -1)"),
        ("negate(1:1/4)", "calc(-25% - 5px)"),
        ("-1/4", "calc(-25% - 25px)"),
        ("negate(block)", "-20px"),
        ("negate(negate(1/4))", "calc(25% - 15px)"),
        ("negate(1/4, 10px)", "calc(10px - (25% - 15px))"),
        ("negate(block, xs + 5px)", "-5px"),
        ("calc(negate(1/4) + 3px)", "calc((25% - 15px) * -1 + 3px)"),
    ] {
        for directive in ["@space margin-left", "@column-offset"] {
            assert_css(
                &format!(".x{{{directive} {value} mobile}}"),
                &format!(".x{{@media (width <= 739px){{margin-left:{expected}}}}}"),
                spacing_config(),
            );
        }
    }
    let mut cfg = spacing_config();
    cfg["theme"]["spacing"]["offset"] = json!({"*":"negate(1/4)"});
    assert_css(
        ".x{@space margin-left offset tablet}",
        ".x{@media (width >= 740px) and (width <= 1023px){margin-left:calc((25% - 22.5px) * -1)}}",
        cfg,
    );
}

#[test]
fn negate_invalid_arguments_and_token_cycles_are_bounded() {
    for value in ["negate()", "negate(1/4,)", "negate(,1/4)", "negate(1,2,3)"] {
        assert!(compile(&request(
            &format!(".x{{@space left {value}}}"),
            spacing_config()
        ))
        .is_err());
    }
    for value in ["negate(loop)", "negate(1px, loop)"] {
        let mut cfg = spacing_config();
        cfg["theme"]["spacing"]["loop"] = json!(value);
        assert!(compile(&request(".x{@space left loop}", cfg)).is_err());
    }
}

#[test]
fn gutter_reference_cycles_and_non_numeric_negation_fail_at_the_directive() {
    for gutter in ["calc(var[1])", "calc(var[1/4])", "negate(1/4)"] {
        for value in ["1", "1/4", "negate(1/4)"] {
            let mut cfg = spacing_config();
            cfg["theme"]["columns"]["gutters"] = json!({"*":gutter});
            let error = compile(&request(
                &format!(".x{{\n@space left {value} mobile}}"),
                cfg,
            ))
            .unwrap_err();
            assert_eq!(error.code, "EU_SIZE");
            assert_eq!(error.line, 2);
            assert!(error.message.contains("Cyclic"), "{gutter}: {error}");
        }
    }
    for value in [
        "negate(auto)",
        "negate(inherit)",
        "negate(1px, normal)",
        "between(1e308px--1e308px)",
        "-1e308/0.001",
    ] {
        let error = compile(&request(
            &format!(".x{{@space left {value} mobile}}"),
            spacing_config(),
        ))
        .unwrap_err();
        assert_eq!(error.code, "EU_SIZE", "{value}: {error}");
    }
}
