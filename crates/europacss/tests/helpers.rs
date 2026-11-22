mod support;
use europacss::{compile, compile_frontend};
use support::{assert_css, config, request};

// Ported from substituteAbs100AtRules.test.js and substituteEmbedResponsiveAtRules.test.js.
const ABS: &str = "position:absolute;width:100%;height:100%;top:0;left:0";

#[test]
fn abs100_with_and_without_important() {
    assert_css(
        ".element {@abs100}",
        &format!(".element {{{ABS}}}"),
        config(),
    );
    assert_css(".element {@abs100!}", ".element {position:absolute!important;width:100%!important;height:100%!important;top:0!important;left:0!important}", config());
}

#[test]
fn abs100_breakpoints_collections_comparisons_and_ranges() {
    for (query, media) in [
        ("tablet", "(width >= 740px) and (width < 1024px)"),
        ("$lg", "(width >= 1024px)"),
        (">=tablet", "(width >= 740px)"),
        ("300px->800px", "(width >= 300px) and (width <= 800px)"),
    ] {
        assert_css(
            &format!(".element {{@abs100 {query};}}"),
            &format!("@media {media} {{.element {{{ABS}}}}}"),
            config(),
        );
    }
}

#[test]
fn abs100_inherits_responsive_context_once_and_keeps_later_overrides() {
    assert_css(".x {@responsive tablet {@abs100; position:relative}}", ".x {@media (width >= 740px) and (width < 1024px) {position:absolute;width:100%;height:100%;top:0;left:0;position:relative}}", config());
    let output = compile_frontend(&request(".x {@responsive tablet {@abs100}}", config())).unwrap();
    assert_eq!(output.css.matches("@media").count(), 1);
}

#[test]
fn helper_argument_and_context_errors_are_actionable() {
    for (source, code) in [
        ("@abs100;", "EU_CONTEXT"),
        (".x {@abs100 {color:red}}", "EU_ARGUMENTS"),
        (".x {@abs100 tablet extra;}", "EU_ARGUMENTS"),
        (
            ".x {@responsive tablet {@abs100 desktop;}}",
            "EU_RESPONSIVE",
        ),
        ("@embed-responsive 16/9;", "EU_CONTEXT"),
        (".x {@embed-responsive;}", "EU_ARGUMENTS"),
        (".x {@embed-responsive 16/9 {color:red}}", "EU_ARGUMENTS"),
    ] {
        assert_eq!(
            compile(&request(source, config())).unwrap_err().code,
            code,
            "{source}"
        );
    }
    for ratio in [
        "0/9",
        "16/0",
        "-16/9",
        "16/-9",
        "NaN/9",
        "Infinity/9",
        "16",
        "16/9/4",
        "16px/9",
        "1e-300/1e300",
    ] {
        let source = format!(".x {{@embed-responsive {ratio};}}");
        assert_eq!(
            compile(&request(&source, config())).unwrap_err().code,
            "EU_ARGUMENTS",
            "{ratio}"
        );
    }
}

#[test]
fn responsive_embed_matches_the_legacy_pseudo_element_layout() {
    assert_css(
        "article {background-color:green;@embed-responsive 16/9}",
        "article {background-color:green;position:relative;width:100%; &::before {display:block;content:'';padding-top:56.25%} iframe,embed,object,video {position:absolute;top:0;left:0;width:100%;height:100%;border:0}}",
        config(),
    );
}

#[test]
fn embeds_keep_scope_native_specificity_and_authored_overrides() {
    assert_css(
        "@layer media {.card,#featured {@responsive $lg {@embed-responsive 1/1; position:static;}}}",
        "@layer media {.card,#featured {@media (width >= 1024px) {position:relative;width:100%; &::before {display:block;content:'';padding-top:100%} iframe,embed,object,video {position:absolute;top:0;left:0;width:100%;height:100%;border:0} position:static;}}}",
        config(),
    );
}
