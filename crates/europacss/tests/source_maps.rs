mod support;
use europacss::{compile, Output};
use parcel_sourcemap::{OriginalLocation, SourceMap};
use serde_json::json;
use support::{assert_css, config, request};

fn location(text: &str, offset: usize) -> (u32, u32) {
    let prefix = &text[..offset];
    (
        prefix.bytes().filter(|b| *b == b'\n').count() as u32,
        prefix.rsplit('\n').next().unwrap().encode_utf16().count() as u32,
    )
}
fn origin(output: &Output, needle: &str) -> (OriginalLocation, Option<String>) {
    let (line, column) = location(
        &output.css,
        output
            .css
            .find(needle)
            .unwrap_or_else(|| panic!("Missing {needle} in {}", output.css)),
    );
    let mut map = SourceMap::from_json("/", output.map.as_ref().unwrap()).unwrap();
    let origin = map
        .find_closest_mapping(line, column)
        .unwrap_or_else(|| panic!("No mapping for {needle}: {}", output.css))
        .original
        .unwrap_or_else(|| panic!("No original for {needle}"));
    let name = origin.name.map(|n| map.get_name(n).unwrap().to_string());
    (origin, name)
}
fn assert_origin(output: &Output, needle: &str, input: &str, authored: &str) {
    let original = origin(output, needle).0;
    assert_eq!(
        (original.original_line, original.original_column),
        location(input, input.find(authored).unwrap()),
        "{needle} in {}",
        output.css
    );
}

#[test]
fn declarations_map_to_directives_and_authored_properties_through_nesting_and_minification() {
    let input = "/* 🙂 */\r\n.card {\r\n  @color fg red;\r\n  padding-left: 13px;\r\n  &:hover {\r\n    @space width 19px;\r\n    opacity: .75;\r\n  }\r\n}";
    for minify in [false, true] {
        for target in ["chrome 100", "chrome 131"] {
            let mut req = request(input, config());
            req.minify = minify;
            req.browsers = vec![target.into()];
            let output = compile(&req).unwrap();
            assert_origin(&output, "color:", input, "@color");
            assert_origin(&output, "padding-left:", input, "padding-left");
            assert_origin(&output, "width:", input, "@space");
            assert_origin(&output, "opacity:", input, "opacity");
        }
    }
}

#[test]
fn token_comments_are_disabled_custom_properties_and_leave_maps_correct() {
    let input = ".card {\n  @fontsize body;\n  opacity: .75;\n}\n.other { color: red }";
    let mut cfg = config();
    cfg["theme"]["typography"]["sizes"]["body"] = json!({"*":"20px"});
    cfg["theme"]["typography"]["families"] = json!({"serif": "Georgia, serif"});
    let mut req = request(input, cfg);
    req.minify = false;
    let plain = compile(&req).unwrap();
    assert!(!plain.css.contains("--ec-font-token"));
    req.debug_tokens = true;
    let output = compile(&req).unwrap();
    assert!(
        output
            .css
            .contains("/* --ec-font-token: \"typography.sizes.body\"; */"),
        "{}",
        output.css
    );
    assert_origin(&output, "font-size:", input, "@fontsize");
    assert_eq!(
        origin(&output, "font-size:").1.as_deref(),
        Some("typography.sizes.body")
    );
    assert_origin(&output, "opacity:", input, "opacity");
    assert_origin(&output, "color:", input, "color");
    assert_css(&output.css, &plain.css, config());
    req.source_map = false;
    let no_map = compile(&req).unwrap();
    assert!(no_map.map.is_none());
    assert_eq!(no_map.css, output.css);
    req.minify = true;
    assert!(!compile(&req).unwrap().css.contains("--ec-font-token"));
}

#[test]
fn merged_shorthands_and_ambiguous_values_do_not_claim_one_directive() {
    let input = ".card {\n color: red;\n margin-top: 1px;\n margin-right: 2px;\n margin-bottom: 3px;\n margin-left: 4px;\n}\n.same { width: 3px; width: 3px }";
    let output = compile(&request(input, config())).unwrap();
    assert_origin(&output, "color:", input, "color");
    assert_origin(&output, "margin:", input, ".card");
    assert_origin(&output, "width:", input, ".same");
}

#[test]
fn identical_values_in_other_selectors_cannot_supply_a_false_origin() {
    let input = ".first { color: red }\n.second { opacity: .75; color: blue }";
    let output = compile(&request(input, config())).unwrap();
    assert_origin(&output, "opacity:", input, "opacity");
    assert_origin(&output, "color:#00f", input, "color: blue");
}

#[test]
fn prefixes_responsive_tokens_keyframes_and_utf16_columns_keep_their_origins() {
    let input = "/* 🙂 */ .card { content: 'text'; user-select: none; @fontsize body; }\n@keyframes fade { from { opacity: 0 } to { opacity: 1 } }";
    let mut cfg = config();
    cfg["theme"]["typography"]["sizes"]["body"] =
        json!({"mobile":"16px", "tablet":"18px", "desktop":"20px"});
    for minify in [false, true] {
        let mut req = request(input, cfg.clone());
        req.minify = minify;
        req.debug_tokens = true;
        req.browsers = vec!["safari 15".into()];
        let output = compile(&req).unwrap();
        assert_origin(&output, "-webkit-user-select:", input, "user-select");
        assert_origin(&output, "font-size:", input, "@fontsize");
        // Lightning does not map keyframe rules. Never inherit a preceding
        // selector's attribution, including on a single minified line.
        let needle = if minify { "opacity:0" } else { "opacity: 0" };
        let (line, column) = location(&output.css, output.css.find(needle).unwrap());
        let mut map = SourceMap::from_json("/", output.map.as_deref().unwrap()).unwrap();
        assert!(map
            .find_closest_mapping(line, column)
            .and_then(|m| m.original)
            .is_none());
        assert_eq!(
            output.css.matches("--ec-font-token").count(),
            if minify { 0 } else { 3 }
        );
    }
}

#[test]
fn a_single_directive_can_supply_a_shorthand_but_literal_sizes_have_no_token_label() {
    let input = ".a { @space margin 12px; } .b { @fontsize 23px; } .c { @font serif body; }";
    let mut cfg = config();
    cfg["theme"]["typography"]["sizes"]["body"] = json!({"*":"20px"});
    cfg["theme"]["typography"]["families"] = json!({"serif": "Georgia, serif"});
    let mut req = request(input, cfg);
    req.debug_tokens = true;
    req.minify = false;
    let output = compile(&req).unwrap();
    assert_origin(&output, "margin:", input, "@space");
    assert_eq!(
        output.css.matches("--ec-font-token").count(),
        1,
        "{}",
        output.css
    );
}
