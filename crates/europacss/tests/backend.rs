use europacss::{compile, resolve_config, Request};
use parcel_sourcemap::SourceMap;
use serde_json::json;

fn request(source: &str) -> Request {
    Request {
        source: source.into(), filename: "source.css".into(), source_map: true,
        minify: true, debug_tokens: false, browsers: vec!["chrome 100".into()],
        config: resolve_config(json!({
            "enabled": true,
            "theme": {
                "breakpoints": {"mobile":"0", "tablet":"740px", "desktop":"1024px"},
                "breakpointCollections": {"$sm":"mobile/tablet", "$lg":"desktop"},
                "colors": {"brand":{"dark":"#123456"}, "literal/slash":"red"},
                "spacing": {"md":{"mobile":"10px", "tablet":"20px", "desktop":"30px"}},
                "typography": {
                    "families": {"sans":["Inter","sans-serif"], "header/display":["Georgia","serif"]},
                    "sizes": {
                        "base": {"__base__":{"line-height":"150%"}, "mobile":"16px", "tablet":"18px", "desktop":"20px"},
                        "header/large": {"mobile":"24px", "tablet":"32px", "desktop":"40px"}
                    }
                }
            }
        })).unwrap(),
    }
}
fn css(source: &str) -> String {
    compile(&request(source)).unwrap().css
}

#[test]
fn leading_layer_order_stays_at_the_front_with_empty_and_populated_layers() {
    for minify in [true, false] {
        let mut req = request(
            "@layer reset,vendor,brando,app;@layer reset{*{margin:0}}@layer brando{.a{color:red}}",
        );
        req.minify = minify;
        let output = compile(&req).unwrap();
        assert!(
            output.css.starts_with(if minify {
                "@layer reset,vendor,brando,app;"
            } else {
                "@layer reset, vendor, brando, app;"
            }),
            "{}",
            output.css
        );
        assert_eq!(output.css.matches("@layer app;").count(), 0);
    }
}

#[test]
fn authored_color_precision_is_unchanged_until_the_lightning_backend() {
    let req = request(".x{background:linear-gradient(rgb(0% 0% 0% / .30375),transparent);color:var(--color,hsl(198,100%,50%))}");
    let frontend = europacss::compile_frontend(&req).unwrap();
    assert!(frontend.css.contains(".30375"));
    assert!(frontend.css.contains("hsl(198,100%,50%)"));
    let output = compile(&req).unwrap();
    assert!(output.css.contains("#0000004d"));
    assert!(output.css.contains("#00b2ff"));
}

#[test]
fn old_prelude_blocker_compiles_through_our_parser_and_rust_lightning() {
    assert_eq!(
        css(".card { @color fg brand.dark $lg; }"),
        css("@media (width >= 1024px) { .card {color: #123456} }")
    );
    assert_eq!(
        css(".card { @color! fg/**/var(--accent, rgb(1, 2, 3)); @color bg literal/slash; }"),
        css(".card {color:var(--accent, rgb(1, 2, 3)) !important; background-color:red}")
    );
}

#[test]
fn common_overrides_keep_source_order_and_responsive_rules_follow_them() {
    assert_eq!(
        css(".card {@color fg red; color:blue}"),
        css(".card {color:blue}")
    );
    assert_eq!(
        css(".card {color:blue; @color fg red;}"),
        css(".card {color:red}")
    );
    let output = css("body {@fontsize base; line-height:normal}");
    assert!(output.find("line-height:normal").unwrap() < output.find("font-size:").unwrap());
    assert!(!output.contains("line-height:150%"));
}

#[test]
fn native_nesting_specificity_and_interleaved_declarations() {
    assert_eq!(
        css(".card, #featured {.title {@color fg red;}}"),
        css(":is(.card, #featured) .title {color:red}")
    );
    let output = css(".card {color:red; @responsive $lg {color:blue} color:green}");
    assert_eq!(
        output,
        ".card{color:green}@media (min-width:1024px){.card{color:#00f}}"
    );
}

#[test]
fn nesting_is_retained_only_when_all_targets_support_it() {
    let source = ".card,#featured {color:red; .title {color:blue} @media (width >= 740px) {padding:20px} color:green}";
    let mut req = request(source);
    let lowered = compile(&req).unwrap();
    assert!(lowered.css.contains(":is(.card,#featured) .title"));
    req.browsers = vec!["chrome 131, firefox 132, safari 18.2".into()];
    let modern = compile(&req).unwrap();
    assert!(modern.css.len() < lowered.css.len(), "{}", modern.css);
    assert!(modern.css.contains(".title{"));
    assert!(!modern.css.contains(":is(.card,#featured) .title"));
    // Compiling the retained nesting back to older targets must preserve the
    // selector-list specificity, nested media and trailing declaration order.
    req.source = modern.css;
    req.browsers = vec!["chrome 100".into()];
    assert_eq!(compile(&req).unwrap().css, lowered.css);
    req.source = source.into();
    req.browsers = vec!["chrome 131, safari 15".into()];
    assert!(compile(&req)
        .unwrap()
        .css
        .contains(":is(.card,#featured) .title"));
    let map: serde_json::Value = serde_json::from_str(modern.map.as_ref().unwrap()).unwrap();
    assert_eq!(map["sourcesContent"][0], source);
}

#[test]
fn scope_and_separated_duplicate_selectors_are_preserved() {
    assert_eq!(css("@layer components {@supports (display:grid) {.card {@display grid $lg;}}}"), css("@layer components {@supports (display:grid) {@media (width >= 1024px) {.card {display:grid}}}}"));
    assert_eq!(
        css(".a {@color fg red;} .b {@color fg blue;} .a {@color fg green;}"),
        css(".a {color:red} .b {color:blue} .a {color:green}")
    );
}

#[test]
fn basic_directives_compile_with_common_rules_before_media() {
    assert_eq!(css(".card {@display flex/column/wrap; @order 2; @font header/display; @fontsize header/large $lg; @space padding-x 12px;}"), css(".card {display:flex; flex-direction:column; flex-wrap:wrap; order:2; font-family:Georgia,serif} @media (width >= 1024px) {.card {font-size:40px}} .card {padding-left:12px; padding-right:12px}"));
    assert_eq!(css(".card {@responsive $sm {@space margin-y md;}}"), css("@media (width < 1024px) {@media (width < 740px) {.card {margin-top:10px; margin-bottom:10px}} @media (width >= 740px) and (width < 1024px) {.card {margin-top:20px; margin-bottom:20px}}}"));
}

#[test]
fn reuse_and_conditionals_preserve_use_site_order() {
    assert_eq!(
        css(
            ".button {@extend %pill; color:blue} %pill {@color fg red; &:hover {@color fg green;}}"
        ),
        ".button{color:red}.button:hover{color:green}.button{color:#00f}"
    );
    assert_eq!(
        css(".card {@if enabled {@color fg red;} color:blue}"),
        css(".card {color:blue}")
    );
}

#[test]
fn source_maps_compose_through_nesting() {
    let input = "/* 🙂 */\r\n.card {\r\n  &:hover {\r\n    @color fg red;\r\n  }\r\n}";
    let mut request = request(input);
    request.minify = false;
    let output = compile(&request).unwrap();
    let line = output
        .css
        .lines()
        .position(|s| s.contains(".card:hover"))
        .unwrap();
    let mut map = SourceMap::from_json("/", output.map.as_ref().unwrap()).unwrap();
    let original = map
        .find_closest_mapping(line as u32, 0)
        .unwrap()
        .original
        .unwrap();
    assert_eq!((original.original_line, original.original_column), (2, 2));
    let json: serde_json::Value = serde_json::from_str(output.map.as_ref().unwrap()).unwrap();
    assert_eq!(json["sources"][0], "source.css");
    assert_eq!(json["sourcesContent"][0], input);
}

#[test]
fn backend_diagnostics_map_to_authored_source_even_without_output_maps() {
    for enabled in [true, false] {
        let mut request = request(".card {\n  &:nth-child(nope) { color: red; }\n}");
        request.source_map = enabled;
        let error = compile(&request).unwrap_err();
        assert_eq!(error.code, "EU_CSS");
        assert_eq!(error.line, 2);
    }
    let mut request = request(".card {@color fg red;}");
    request.source_map = false;
    assert!(compile(&request).unwrap().map.is_none());
}

#[test]
fn repeated_compilation_has_no_shared_placeholder_state() {
    css("%pill {color:red} .x {@extend %pill;}");
    assert_eq!(
        compile(&request(".x {@extend %pill;}")).unwrap_err().code,
        "EU_EXTEND"
    );
    assert_eq!(css(".x {@color fg red;}"), css(".x {color:red}"));
}

#[test]
fn browser_targets_are_validated() {
    let mut request = request(".x {color:red}");
    request.browsers = vec!["madeup-browser 100".into()];
    assert_eq!(compile(&request).unwrap_err().code, "EU_TARGETS");
}

#[test]
fn advanced_json5_typography_matches_explicit_css() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("examples/europa.json5");
    let config = europacss::load_config(&path).unwrap();
    assert_eq!(
        config["theme"]["typography"]["sizes"]["heading/4xl"]["__base__"]["font-family"],
        json!(["Inter", "sans-serif"])
    );

    let mut req = Request {
        source: ".hero-title { @fontsize heading/4xl; }".into(),
        filename: "advanced.css".into(),
        config,
        minify: true,
        browsers: vec!["chrome 100".into()],
        ..Request::default()
    };
    let generated = compile(&req).unwrap();
    req.source = r#"
        .hero-title {
            font-family: Inter, sans-serif;
            font-weight: 600;
            line-height: 1.1;
            letter-spacing: -0.025em;
        }
        @media (width < 740px) {
            .hero-title { font-size: 32px; line-height: 1.15; }
        }
        @media (width >= 740px) and (width < 1024px) {
            .hero-title { font-size: 48px; }
        }
        @media (width >= 1024px) {
            .hero-title { font-size: clamp(48px, 4vw, 72px); letter-spacing: -0.04em; }
        }
    "#
    .into();
    let expected = compile(&req).unwrap();
    assert_eq!(generated.css, expected.css);
    assert!(generated.warnings.is_empty());
}

#[test]
fn url_payload_delimiters_survive_the_frontend_and_lightning_backend() {
    for (unquoted, quoted) in [
        ("url(data:text/plain,};[)", "url('data:text/plain,};[')"),
        ("URL(icons/a{.svg)", "url('icons/a{.svg')"),
        (r"u\72l(icons/a].svg)", "url('icons/a].svg')"),
        (r"\75 rl(icons/a[.svg)", "url('icons/a[.svg')"),
        ("url(icons/*literal.svg)", "url('icons/*literal.svg')"),
        (
            r"url(icons/theme\(ink\).svg)",
            "url('icons/theme(ink).svg')",
        ),
    ] {
        assert_eq!(
            css(&format!(
                ".x{{background:{unquoted};@color fg red;}} .after{{color:blue}}"
            )),
            css(&format!(
                ".x{{background:{quoted};color:red;}} .after{{color:blue}}"
            )),
            "{unquoted}"
        );
    }
}
