use europacss::{compile, resolve_config, Request};
use parcel_sourcemap::SourceMap;
use serde_json::json;

fn request(source: &str) -> Request {
    Request {
        source: source.into(), filename: "source.css".into(), source_map: true,
        minify: true, browsers: vec!["chrome 100".into()],
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
fn authored_overrides_win_in_source_order() {
    assert_eq!(
        css(".card {@color fg red; color:blue}"),
        css(".card {color:blue}")
    );
    assert_eq!(
        css(".card {color:blue; @color fg red;}"),
        css(".card {color:red}")
    );
    let output = css("body {@fontsize base; line-height:normal}");
    assert!(output.rfind("line-height:normal").unwrap() > output.find("line-height:150%").unwrap());
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
        ".card{color:red}@media (min-width:1024px){.card{color:#00f}}.card{color:green}"
    );
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
fn basic_directives_compile_together_without_reordering() {
    assert_eq!(css(".card {@display flex/column/wrap; @order 2; @font header/display; @fontsize header/large $lg; @space padding-x 12px;}"), css(".card {display:flex; flex-direction:column; flex-wrap:wrap; order:2; font-family:Georgia,serif} @media (width >= 1024px) {.card {font-size:40px}} .card {padding-left:12px; padding-right:12px}"));
    assert_eq!(css(".card {@responsive $sm {@space margin-y md;}}"), css("@media (width <= 1023px) {@media (width <= 739px) {.card {margin-top:10px; margin-bottom:10px}} @media (width >= 740px) and (width <= 1023px) {.card {margin-top:20px; margin-bottom:20px}}}"));
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
