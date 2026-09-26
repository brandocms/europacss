use europacss::parser::{arguments, interpolate, parse, validate_interpolation};

#[test]
fn interpolation_respects_comments_escapes_and_placeholder_boundaries() {
    assert_eq!(
        interpolate(
            r#"--$key: '$key $key-$value $keyboard $value2'; /* $key $value */ --escaped: \$key;"#,
            "café",
            Some("red")
        )
        .unwrap(),
        r#"--café: 'café café-red $keyboard $value2'; /* $key $value */ --escaped: \$key;"#
    );
    assert_eq!(
        interpolate("content:'$value'", "x", Some("a'b\\c\n")).unwrap(),
        "content:'a\\'b\\\\c\\a '"
    );
    assert!(interpolate("content:'$value'", "x", None).is_err());
    assert_eq!(
        interpolate("--$key: '$key'", "x", None).unwrap(),
        "--x: 'x'"
    );
}

#[test]
fn interpolation_keeps_balanced_custom_values_and_rejects_structure_changes() {
    for value in [
        "--tokens: { colors: [red; blue] }",
        "content: 'a; } b'",
        "background: url('data:a;b')",
    ] {
        validate_interpolation(value, false).unwrap();
    }
    validate_interpolation("&.café:is(.a, .b)", true).unwrap();
    for value in [
        "color:red; width:0",
        "color:red;} .x {width:0",
        "@media all {}",
    ] {
        assert!(validate_interpolation(value, false).is_err(), "{value}");
    }
}

#[test]
fn template_offsets_point_to_original_utf8_source() {
    let source = "/* 🙂 */\r\n:root { @iterate theme.breakpoints { --breakpoint-$key: $value; } }";
    let nodes = parse(source).unwrap();
    let iteration = &nodes[1].children.as_ref().unwrap()[0];
    let declaration = &iteration.children.as_ref().unwrap()[0];
    assert_eq!(&source[iteration.offset..iteration.offset + 8], "@iterate");
    assert_eq!(
        &source[declaration.offset..declaration.offset + 13],
        "--breakpoint-"
    );
}

#[test]
fn balanced_values_do_not_split_at_internal_comments_or_delimiters() {
    assert_eq!(
        arguments("padding-x/**/calc(var(--x, 1px) + 2px) $sm").unwrap(),
        ["padding-x", "calc(var(--x, 1px) + 2px)", "$sm"]
    );
    let source = r#".x { --tokens: {a: [1; 2]; nested: {key: '}'}}; @iterate theme.values { content: '$key;$value'; } }"#;
    assert_eq!(
        parse(source).unwrap()[0].children.as_ref().unwrap().len(),
        2
    );
    for malformed in [
        ".x {@iterate theme.x { --x: [1); }}",
        ".x {@iterate theme.x {content: 'unfinished}}",
        ".x {@iterate theme.x { /* unfinished }}",
    ] {
        assert!(parse(malformed).is_err(), "{malformed}");
    }
}
