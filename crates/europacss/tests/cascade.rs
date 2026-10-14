#[allow(dead_code)]
mod support;

use europacss::{compile, compile_frontend, parser, Request};
use lightningcss::{
    stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet},
    targets::{Browsers, Targets},
};
use serde_json::json;
use support::{config, request};

// The reference goes directly through Lightning, never through Europa's ordering
// pass. A regression cannot reorder both sides of the assertion and still pass.
fn plain_css(source: &str, req: &Request) -> String {
    let targets = Targets {
        browsers: Browsers::from_browserslist(&req.browsers).unwrap(),
        ..Default::default()
    };
    let mut sheet = StyleSheet::parse(source, ParserOptions::default()).unwrap();
    sheet
        .minify(MinifyOptions {
            targets,
            ..Default::default()
        })
        .unwrap();
    sheet
        .to_css(PrinterOptions {
            targets,
            minify: true,
            ..Default::default()
        })
        .unwrap()
        .code
}

fn check(source: &str, expected: &str) {
    let mut cfg = config();
    cfg["theme"]["typography"]["sizes"] = json!({"xl":{"desktop":"48px"}});
    for target in ["chrome 100", "chrome 131"] {
        let mut req = request(source, cfg.clone());
        req.browsers = vec![target.into()];
        let output = compile(&req).unwrap();
        assert!(output.warnings.is_empty(), "{:?}", output.warnings);
        assert_eq!(output.css, plain_css(expected, &req), "{target}: {source}");
    }
}

#[test]
fn responsive_typography_follows_the_common_fallback_in_either_authored_order() {
    for source in [
        ".title{@fontsize xl $lg;font-size:24px}",
        ".title{font-size:24px;@fontsize xl $lg}",
    ] {
        check(
            source,
            ".title{font-size:24px}.title{@media (width >= 1024px){font-size:48px}}",
        );
    }
}

#[test]
fn media_crosses_later_selectors_and_keeps_native_selector_context() {
    check(
        ".title{@fontsize xl $lg}.compact{font-size:24px}",
        ".compact{font-size:24px}.title{@media (width >= 1024px){font-size:48px}}",
    );
    check(
        ".card,#featured{&::before{@responsive $lg{color:red}color:blue}} .override::before{color:green}",
        ".card,#featured{&::before{color:blue}} .override::before{color:green} .card,#featured{&::before{@media (width >= 1024px){color:red}}}",
    );
}

#[test]
fn layers_and_conditions_contain_their_own_responsive_output() {
    check(
        "@layer reset,vendor,brando,app; @layer brando{@supports(display:grid){.title{@fontsize xl $lg;font-size:24px}.compact{font-size:20px}}} @layer app{.title{font-size:18px}}",
        "@layer reset,vendor,brando,app; @layer brando{@supports(display:grid){.title{font-size:24px}.compact{font-size:20px}.title{@media (width >= 1024px){font-size:48px}}}} @layer app{.title{font-size:18px}}",
    );
    for condition in [
        "@container panel (width > 300px)",
        "@supports (display: grid)",
    ] {
        check(
            &format!("{condition}{{.title{{@fontsize xl $lg;font-size:24px}}}} .outside{{font-size:16px}}"),
            &format!("{condition}{{.title{{font-size:24px}}.title{{@media (width >= 1024px){{font-size:48px}}}}}} .outside{{font-size:16px}}"),
        );
    }
}

#[test]
fn overlapping_media_keep_authored_order_and_nested_media_keep_both_conditions() {
    check(
        "@media(width >= 1024px){.x{color:red}} @media(width >= 740px){.x{color:blue}} .x{color:green}",
        ".x{color:green}@media(width >= 1024px){.x{color:red}}@media(width >= 740px){.x{color:blue}}",
    );
    check(
        "@media(width >= 740px){.x{@media(orientation:landscape){color:red}color:blue}} .x{color:green}",
        ".x{color:green}@media(width >= 740px){.x{color:blue}.x{@media(orientation:landscape){color:red}}}",
    );
}

#[test]
fn common_declarations_specificity_and_important_flags_are_not_rewritten() {
    check(
        ".a{@color fg red;color:blue}.b{color:green}.a{color:purple}",
        ".a{color:red;color:blue}.b{color:green}.a{color:purple}",
    );
    check(
        ".title{@fontsize xl $lg;font-size:24px!important} #small{font-size:12px}",
        ".title{font-size:24px!important}#small{font-size:12px}.title{@media(width >= 1024px){font-size:48px}}",
    );
    check(
        "@layer brando,app;@layer brando{#brando-main .title{@space! padding 8px $lg;padding:4px}}@layer app{.title{padding:2px!important}}",
        "@layer brando,app;@layer brando{#brando-main .title{padding:4px}#brando-main .title{@media(width >= 1024px){padding:8px!important}}}@layer app{.title{padding:2px!important}}",
    );
}

#[test]
fn registrations_and_unknown_at_rules_are_ordering_barriers() {
    for barrier in [
        "@layer first;",
        "@layer first{.b{color:green}}",
        "@media print{@layer first{.b{color:green}}}",
        "@supports(display:grid){@layer first{.b{color:green}}}",
        "@font-face{font-family:Demo;src:url(demo.woff2)}",
        "@property --amount{syntax:'<number>';inherits:false;initial-value:0}",
        "@keyframes fade{from{opacity:0}to{opacity:1}}",
        "@custom-rule{.b{color:green}}",
    ] {
        let source = format!("@media print{{.a{{color:red}}}}{barrier}.a{{color:blue}}");
        let css = compile_frontend(&request(&source, config())).unwrap().css;
        let nodes = parser::parse(&css).unwrap();
        assert_eq!(nodes[0].text, "@media print", "{barrier}: {css}");
        assert_eq!(nodes[2].text, ".a", "{barrier}: {css}");
    }
}

#[test]
fn scope_and_nested_registration_boundaries_survive_selector_splitting() {
    let source = "@layer first,second; .a{@media print{color:red}@layer first{color:blue}color:green} @layer second{.a{color:purple}} @scope (.panel){.a{@media print{color:red}color:blue}}";
    let css = compile_frontend(&request(source, config())).unwrap().css;
    let nodes = parser::parse(&css).unwrap();
    assert_eq!(nodes[1].text, ".a");
    assert_eq!(nodes[1].children.as_ref().unwrap()[0].text, "@media print");
    assert_eq!(nodes[2].text, "@layer second");
    let scope = &nodes[3];
    assert_eq!(scope.text, "@scope (.panel)");
    let scoped = scope.children.as_ref().unwrap();
    assert_eq!(scoped.len(), 2);
    assert_eq!(scoped[0].children.as_ref().unwrap()[0].text, "color:blue");
    assert_eq!(scoped[1].children.as_ref().unwrap()[0].text, "@media print");
}

#[test]
fn media_last_is_idempotent_and_recognizes_case_insensitive_css_at_rules() {
    let mut req = request(
        "@layer ui{.x{@MEDIA print{color:red}color:blue}.y{color:green}}",
        config(),
    );
    let first = compile_frontend(&req).unwrap();
    assert!(first.css.find("color:green").unwrap() < first.css.find("@MEDIA").unwrap());
    req.source = first.css.clone();
    assert_eq!(compile_frontend(&req).unwrap().css, first.css);
}
