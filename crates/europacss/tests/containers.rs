mod support;
use europacss::{compile, compile_frontend};
use serde_json::{json, Value};
use support::{assert_css, config, request};

fn container_config() -> Value {
    let mut cfg = config();
    cfg["dpxViewportSize"] = 1000.into();
    cfg["theme"]["container"] = json!({"maxWidth":{"mobile":"740px","tablet":"1024px","desktop":"1200px"},"padding":{"mobile":"15px","tablet":"35px","desktop":"50px"}});
    cfg
}

#[test]
fn ordinary_containers_expand_at_the_directive_with_breakpoint_specific_properties() {
    let expected = ".card { @media (width <= 739px) {padding-left:15px;padding-right:15px;max-width:740px;margin-left:auto;margin-right:auto;width:100%} @media (width >= 740px) and (width <= 1023px) {padding-left:35px;padding-right:35px;max-width:1024px;margin-left:auto;margin-right:auto;width:100%} @media (width >= 1024px) {padding-left:50px;padding-right:50px;max-width:1200px;margin-left:auto;margin-right:auto;width:100%} }";
    assert_css(".card{@space container;}", expected, container_config());
    assert_css(".card{color:red;@space container mobile;padding-left:99px;}", ".card{color:red;@media (width <= 739px){padding-left:15px;padding-right:15px;max-width:740px;margin-left:auto;margin-right:auto;width:100%}padding-left:99px;}", container_config());
    assert_css(".card{@space container mobile;@space container tablet;}", ".card{@media (width <= 739px){padding-left:15px;padding-right:15px;max-width:740px;margin-left:auto;margin-right:auto;width:100%}@media (width >= 740px) and (width <= 1023px){padding-left:35px;padding-right:35px;max-width:1024px;margin-left:auto;margin-right:auto;width:100%}}", container_config());
}

#[test]
fn viewport_containers_cap_only_when_enabled_at_the_largest_breakpoint() {
    for capped in [false, true] {
        let mut cfg = container_config();
        cfg["setMaxForVw"] = capped.into();
        cfg["theme"]["container"]["padding"] = json!({"*":"4vw"});
        cfg["theme"]["container"]["maxWidth"] =
            json!({"mobile":"100%","tablet":"100%","desktop":"1024px"});
        let last = if capped { "40.96px" } else { "4vw" };
        assert_css(".card{@space container;}", &format!(".card{{@media (width <= 739px){{padding-left:4vw;padding-right:4vw;max-width:100%;margin-left:auto;margin-right:auto;width:100%}}@media (width >= 740px) and (width <= 1023px){{padding-left:4vw;padding-right:4vw;max-width:100%;margin-left:auto;margin-right:auto;width:100%}}@media (width >= 1024px){{padding-left:{last};padding-right:{last};max-width:1024px;margin-left:auto;margin-right:auto;width:100%}}}}"), cfg);
    }
}

#[test]
fn container_queries_and_collections_stay_inside_native_scopes() {
    for query in [">=tablet", "tablet/desktop"] {
        assert_css(&format!("@layer ui {{.card{{@space container {query};}}}}"), "@layer ui {.card{@media (width >= 740px) and (width <= 1023px){padding-left:35px;padding-right:35px;max-width:1024px;margin-left:auto;margin-right:auto;width:100%}@media (width >= 1024px){padding-left:50px;padding-right:50px;max-width:1200px;margin-left:auto;margin-right:auto;width:100%}}}", container_config());
    }
    assert_css(".card{@responsive tablet{@space container;}}", ".card{@media (width >= 740px) and (width <= 1023px){padding-left:35px;padding-right:35px;max-width:1024px;margin-left:auto;margin-right:auto;width:100%}}", container_config());
    assert_css(".card{@space container $lg;}", ".card{@media (width >= 1024px){padding-left:50px;padding-right:50px;max-width:1200px;margin-left:auto;margin-right:auto;width:100%}}", container_config());
}

#[test]
fn dynamic_containers_support_plain_and_design_pixel_minimums() {
    for (padding, expected) in [
        ("*", "calc((100vw - 1200px) / 2)"),
        ("* 30px", "max(30px, calc((100vw - 1200px) / 2))"),
        (
            "* 30dpx",
            "max(calc(3vw * var(--ec-zoom)), calc((100vw - 1200px) / 2))",
        ),
    ] {
        let mut cfg = container_config();
        cfg["theme"]["container"]["padding"]["desktop"] = padding.into();
        assert_css(".card{@space container desktop;}", &format!(".card{{@media (width >= 1024px){{padding-left:{expected};padding-right:{expected};margin-left:0;margin-right:0;width:100vw}}}}"), cfg.clone());
        assert_css(".card{@space margin-left container desktop;@space margin-right -container desktop;}", &format!(".card{{@media (width >= 1024px){{margin-left:{expected};}}@media (width >= 1024px){{margin-right:calc({expected} * -1);}}}}"), cfg);
    }
}

#[test]
fn identical_containers_compact_both_padding_and_maximum_without_changing_conditions() {
    let mut cfg = container_config();
    cfg["theme"]["container"] = json!({"padding":{"*":"20px"},"maxWidth":{"mobile":"100%","tablet":"100%","desktop":"1200px"}});
    let result = compile(&request(".card{@space container;}", cfg)).unwrap();
    assert_eq!(result.css.matches("padding-left:20px").count(), 2);
    assert_eq!(result.css.matches("max-width:100%").count(), 1);
    assert_eq!(result.css.matches("max-width:1200px").count(), 1);
    assert!(result.css.contains("739px"));
    assert!(result.css.contains("740px"));
}

#[test]
fn invalid_container_configuration_and_context_have_diagnostics() {
    for source in [
        "@space container;",
        ".x{@space container mobile extra;}",
        ".x{@responsive tablet{@space container desktop;}}",
    ] {
        assert!(
            compile(&request(source, container_config())).is_err(),
            "{source}"
        );
    }
    for padding in ["*20px", "* 10px 20px", "missing", "calc(var[container])"] {
        let mut cfg = container_config();
        cfg["theme"]["container"]["padding"]["desktop"] = padding.into();
        assert!(
            compile_frontend(&request(".card{@space container desktop;}", cfg)).is_err(),
            "{padding}"
        );
    }
}
