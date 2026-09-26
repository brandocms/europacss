use europacss::parser::{arguments, interpolate, parse, validate_interpolation};

#[test]
fn value_visiting_skips_literals_and_preserves_nested_component_structure() {
    use europacss::parser::{rewrite_value, split_top_level};
    let source = r#"calc((10dpx) + var[gap]) '10dpx' url(10dpx.png) /* 10dpx */ var(--my-dpx) 🙂"#;
    let result = rewrite_value(source, &mut |name, args| {
        Ok(match (name, args) {
            ("10dpx", None) => Some("1vw".into()),
            ("var[]", Some("gap")) => Some("20px".into()),
            _ => None,
        })
    })
    .unwrap();
    assert_eq!(
        result,
        r#"calc((1vw) + 20px) '10dpx' url(10dpx.png) /* 10dpx */ var(--my-dpx) 🙂"#
    );
    assert_eq!(
        split_top_level("md, calc(1px + var(--x, 2px)), 'a,b'", ',').unwrap(),
        ["md", "calc(1px + var(--x, 2px))", "'a,b'"]
    );
}

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

#[test]
fn unquoted_urls_keep_braces_brackets_and_comment_markers_as_payload() {
    use europacss::parser::{rewrite_value, split_top_level};
    // CSS Syntax's URL token consumes these characters as data, not nested blocks.
    for url in [
        "url(data:text/plain,};[)",
        "URL(icons/a{.svg)",
        r"u\72l(icons/a].svg)",
        r"\75 rl(icons/a[.svg)",
        "url(icons/*literal.svg)",
        r"url(icons/a\)b.svg)",
    ] {
        let source = format!(".x{{background:{url};color:red}}.after{{color:blue}}");
        let nodes = parse(&source).unwrap();
        assert_eq!(nodes.len(), 2, "{url}");
        assert_eq!(nodes[0].children.as_ref().unwrap().len(), 2, "{url}");
        assert_eq!(
            arguments(&format!("{url} mobile")).unwrap(),
            [url, "mobile"]
        );
        assert_eq!(
            split_top_level(&format!("{url}, red"), ',').unwrap(),
            [url, "red"]
        );
        assert_eq!(
            rewrite_value(url, &mut |_, _| panic!("URL payload was visited: {url}")).unwrap(),
            url
        );
    }
    // A longer identifier containing `url` must keep normal function parsing.
    for name in ["myurl", r"my\20 url", "1url"] {
        assert!(parse(&format!(".x{{--value:{name}(a{{);}}")).is_err());
    }
}

#[test]
fn url_escapes_are_opaque_to_value_functions_and_split_delimiters() {
    use europacss::parser::{rewrite_value, split_top_level, unsupported_function};
    let source = r"u\72l(assets/theme\(ink\)-10dpx.svg) calc(10dpx + 1px)";
    let rewritten = rewrite_value(source, &mut |name, args| {
        Ok((name == "10dpx" && args.is_none()).then(|| "2vw".into()))
    })
    .unwrap();
    assert_eq!(
        rewritten,
        r"u\72l(assets/theme\(ink\)-10dpx.svg) calc(2vw + 1px)"
    );
    assert_eq!(unsupported_function(source).unwrap(), None);
    assert_eq!(
        split_top_level(r"foo\-bar-baz-url(a-b)", '-').unwrap(),
        [r"foo\-bar", "baz", "url(a-b)"]
    );
}

#[test]
fn malformed_unquoted_urls_fail_without_consuming_later_rules() {
    for url in [
        "url(a b)",
        "url(a(b)",
        "url(a'b)",
        "url(a\"b)",
        "url(a\u{7}b)",
        "url(a\\\nb)",
        "url(unfinished",
    ] {
        let source = format!(".x{{background:{url};}} .after{{color:red}}");
        assert!(parse(&source).is_err(), "{url}");
    }
    for url in ["url()", "url( \t )", "url(  a.svg\n )", "url(  'a b.svg' )"] {
        parse(&format!(".x{{background:{url}}}")).unwrap();
    }
}
