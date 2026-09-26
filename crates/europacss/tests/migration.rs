mod support;
use europacss::migration::{self, LEGACY_VERSION};
use serde_json::json;
use support::{assert_css, config, request};

fn analyze(source: &str) -> migration::Report {
    migration::analyze(&request(source, config()), LEGACY_VERSION).unwrap()
}

#[test]
fn specificity_reports_actual_branch_changes_including_class_only_lists() {
    for (source, old, new) in [
        (".card, #featured {.title{color:red}}", "(0,2,0)", "(1,1,0)"),
        (
            ".card, .card.active {&:hover{color:red}}",
            "(0,2,0)",
            "(0,3,0)",
        ),
        (
            ".a, #b {:nth-child(2n of &){color:red}}",
            "(0,2,0)",
            "(1,1,0)",
        ),
        (".a, #b {& + &{color:red}}", "(0,2,0)", "(2,0,0)"),
    ] {
        let report = analyze(source);
        assert!(report.analysis_complete, "{report:?}");
        let findings: Vec<_> = report
            .findings
            .iter()
            .filter(|f| f.diagnostic.code == "EU_MIGRATION_SPECIFICITY")
            .collect();
        assert_eq!(findings.len(), 1, "{report:?}");
        assert!(findings[0].diagnostic.message.contains(old), "{report:?}");
        assert!(findings[0].diagnostic.message.contains(new), "{report:?}");
        assert!(findings[0].fix.is_none());
    }
}

#[test]
fn equal_specificity_where_and_declaration_only_conditions_do_not_warn() {
    for source in [
        ".a, .b {.title{color:red}}",
        ".a, #b {color:red;@responsive mobile{color:blue}}",
        ".a, #b {:where(&){color:red}}",
        ".a, #b {:is(&, #dominant){color:red}}",
        ".a, #b {:not(&, #dominant){color:red}}",
        ".a, #b {:has(&, #dominant){color:red}}",
        ".a[data-x='&'], .b:is(.x,.y) {color:red}",
        ".a { [data-x='&'] {color:red}}",
    ] {
        let report = analyze(source);
        assert!(report.findings.is_empty(), "{source}: {report:?}");
        assert!(report.analysis_complete);
    }
}

#[test]
fn nested_specificity_is_propagated_through_conditions_and_multiple_levels() {
    let report = analyze(".a, #b { @supports(display:grid){.child{.grandchild{color:red}}}} ");
    assert_eq!(report.findings.len(), 2, "{report:?}");
    assert!(report
        .findings
        .iter()
        .any(|f| f.diagnostic.message.contains("(0,3,0) to (1,2,0)")));
    let report = analyze(".a::before{&:hover{color:red}}");
    assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_MATCHING");
    assert!(!report.analysis_complete);
}

#[test]
fn generated_selectors_are_analyzed_with_the_actual_configuration() {
    let mut cfg = config();
    cfg["theme"]["variants"] = json!({"danger":"red"});
    let report = migration::analyze(
        &request(
            ".a, #b {@iterate theme.variants {&.$key{color:$value}}}",
            cfg,
        ),
        LEGACY_VERSION,
    )
    .unwrap();
    assert!(report.analysis_complete, "{report:?}");
    assert_eq!(report.findings.len(), 1);
    assert!(report.findings[0].diagnostic.message.contains(".danger"));
}

#[test]
fn syntax_autofix_flattens_suffixes_in_order_inside_existing_scopes() {
    let source = "/* keep */ @layer ui {@supports(display:grid){.card {color:red;/* title */ &__title{color:blue;&-large{font-size:30px}}color:green;@media print{&__print{color:black}}}}} .after{color:purple}";
    let report = analyze(source);
    let edits: Vec<_> = report
        .findings
        .iter()
        .filter_map(|f| f.fix.as_ref())
        .flat_map(|f| f.edits.clone())
        .collect();
    assert_eq!(report.findings.len(), 3, "{report:?}");
    assert!(!edits.is_empty());
    let fixed = migration::apply_edits(source, "rule.css", &edits).unwrap();
    assert!(fixed.contains("/* keep */"));
    assert!(fixed.contains("/* title */"));
    assert!(analyze(&fixed).findings.is_empty(), "{fixed}");
    let expected = "/* keep */ @layer ui {@supports(display:grid){.card{color:red;/* title */}.card__title{color:blue}.card__title-large{font-size:30px}.card{color:green}@media print{.card__print{color:black}}}} .after{color:purple}";
    assert_css(&fixed, expected, config());
    assert_eq!(
        migration::apply_edits(&fixed, "rule.css", &[]).unwrap(),
        fixed
    );
}

#[test]
fn suffix_fixes_decline_complex_or_generated_contexts() {
    for source in [
        ".card:hover{&__title{color:red}}",
        ".card,.other{&__title{color:red}}",
        ".outer{.card{&__title{color:red}}}",
        ".card{@space padding 20px;&__title{color:red}}",
        "%placeholder{&__title{color:red}} .card{@extend %placeholder;}",
    ] {
        let report = analyze(source);
        assert!(
            report
                .findings
                .iter()
                .any(|f| f.diagnostic.code == "EU_MIGRATION_SUFFIX"),
            "{report:?}"
        );
        assert!(
            report.findings.iter().all(|f| f.fix.is_none()),
            "{report:?}"
        );
    }
}

#[test]
fn unknown_versions_limits_and_transform_failures_cannot_look_clean() {
    let req = request(".x{color:red}", config());
    assert_eq!(
        migration::analyze(&req, "1.0.0").unwrap_err().code,
        "EU_MIGRATION_VERSION"
    );
    let parents = (0..20)
        .map(|i| format!(".p{i}"))
        .collect::<Vec<_>>()
        .join(",");
    for source in [
        format!("{parents}{{{parents}{{color:red}}}}"),
        ".x{@fontsize missing;}".into(),
        "@scope(.x){.a,.b{color:red}}".into(),
    ] {
        let report = analyze(&source);
        assert!(!report.analysis_complete, "{report:?}");
        assert!(report
            .findings
            .iter()
            .any(|f| f.diagnostic.code == "EU_MIGRATION_INCOMPLETE"));
    }
}

#[test]
fn base_properties_and_responsive_fallbacks_report_concrete_order_changes() {
    let mut cfg = config();
    cfg["theme"]["typography"]["sizes"] =
        json!({"base":{"__base__":{"line-height":"150%"},"*":"20px"}});
    let report = migration::analyze(
        &request("body{\n @fontsize base;\n line-height:normal;\n}", cfg),
        LEGACY_VERSION,
    )
    .unwrap();
    assert_eq!(report.findings.len(), 1, "{report:?}");
    assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_ORDER");
    assert_eq!(report.findings[0].diagnostic.line, 3);
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("line-height: 150%"));
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("line-height: normal"));
    assert!(
        report.findings[0]
            .fix
            .as_ref()
            .is_some_and(|f| f.kind == "preserve-appearance")
            && !report.findings[0].apply_fix,
        "Preserving legacy order is an explicit review choice"
    );
    let report = analyze(".button{@space height 50px desktop;height:40px}");
    assert_eq!(report.findings.len(), 1, "{report:?}");
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("height: 50px"));
    assert!(report.findings[0]
        .diagnostic
        .message
        .contains("height: 40px"));
}

#[test]
fn order_analysis_understands_shorthands_importance_and_unrelated_properties() {
    for source in [
        ".x{@space margin-left 20px desktop;margin:0}",
        ".x{@space! margin-left 20px desktop;margin:0!important}",
        ".x{@space margin-left 20px desktop;all:unset}",
    ] {
        assert!(
            analyze(source)
                .findings
                .iter()
                .any(|f| f.diagnostic.code == "EU_MIGRATION_ORDER"),
            "{source}"
        );
    }
    for source in [
        ".x{@space margin-left 20px desktop;color:red}",
        ".x{@space margin-left 20px desktop;margin:0!important}",
        ".x{@space! margin-left 20px desktop;margin:0}",
        ".x{margin:0;@space margin-left 20px desktop;}",
        ".x{@space margin-left 20px desktop;margin-left:20px}",
        ".x{@media print{--x:10px}all:unset}",
        ".x{@space margin-left 20px desktop;.child{margin:0}}",
    ] {
        assert!(
            analyze(source).findings.is_empty(),
            "{source}: {:?}",
            analyze(source)
        );
    }
}

#[test]
fn fixes_reject_stale_or_overlapping_source_snapshots() {
    let source = ".card{&__title{color:red}}";
    let report = analyze(source);
    let edits = &report.findings[0].fix.as_ref().unwrap().edits;
    assert!(migration::apply_edits(&source.replace("red", "tan"), "rule.css", edits).is_err());
    let mut overlapping = edits.clone();
    let mut other = edits[0].clone();
    other.replacement.push(' ');
    overlapping.push(other);
    assert!(migration::apply_edits(source, "rule.css", &overlapping).is_err());
}

#[test]
fn generated_suffixes_and_legacy_nest_are_never_silently_accepted() {
    let mut cfg = config();
    cfg["theme"]["variants"] = json!({"__title":"red"});
    let report = migration::analyze(
        &request(".card{@iterate theme.variants {&$key{color:$value}}}", cfg),
        LEGACY_VERSION,
    )
    .unwrap();
    assert!(report
        .findings
        .iter()
        .any(|f| f.diagnostic.code == "EU_MIGRATION_SUFFIX"));
    let report = analyze(".card{@nest .parent & {color:red}} ");
    assert!(report
        .findings
        .iter()
        .any(|f| f.diagnostic.code == "EU_MIGRATION_NEST"));
    assert!(!report.analysis_complete);
}

#[test]
fn repeated_ampersands_can_change_matching_without_changing_specificity() {
    let report = analyze(".a,.b{& + &{color:red}}");
    assert_eq!(report.findings.len(), 1, "{report:?}");
    assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_MATCHING");
    for source in [
        ".a,.b{&&{color:red}}",
        ".a,.b{&[data-x=' ']&{color:red}}",
        ".a,.b{:is(&,&){color:red}}",
    ] {
        assert!(analyze(source).findings.is_empty(), "{source}");
    }
}

#[test]
fn review_decisions_are_explicit_and_bound_to_all_source_and_config_data() {
    let source = ".a,#b{.child{color:red}} .x{@space height 50px desktop;height:40px}";
    let mut report = analyze(source);
    let saved = serde_json::to_string(&report).unwrap();
    migration::apply_acceptances(&mut report, &saved).unwrap();
    assert!(report.findings.iter().all(|f| !f.accepted));
    let mut review = serde_json::to_value(&report).unwrap();
    review["findings"][0]["accepted"] = true.into();
    migration::apply_acceptances(&mut report, &review.to_string()).unwrap();
    assert_eq!(report.findings.iter().filter(|f| f.accepted).count(), 1);

    let mut changed = analyze(&format!("{source} /* unrelated edit */"));
    assert!(migration::apply_acceptances(&mut changed, &review.to_string()).is_err());
    let mut cfg = config();
    cfg["theme"]["colors"]["brand"] = json!("blue");
    let mut changed = migration::analyze(&request(source, cfg), LEGACY_VERSION).unwrap();
    assert!(migration::apply_acceptances(&mut changed, &review.to_string()).is_err());
    for key in ["message", "filename", "code"] {
        let mut invalid = review.clone();
        invalid["findings"][0][key] = "changed".into();
        assert!(migration::apply_acceptances(&mut analyze(source), &invalid.to_string()).is_err());
    }
    review["report_version"] = 0.into();
    assert!(migration::apply_acceptances(&mut analyze(source), &review.to_string()).is_err());
}

#[test]
fn syntax_and_incomplete_analysis_cannot_be_accepted() {
    for source in [
        ".card{&__title{color:red}}",
        ".x::before{.child{color:red}}",
    ] {
        let mut report = analyze(source);
        let mut review = serde_json::to_value(&report).unwrap();
        for finding in review["findings"].as_array_mut().unwrap() {
            finding["accepted"] = true.into();
        }
        assert!(migration::apply_acceptances(&mut report, &review.to_string()).is_err());
        assert!(report.findings.iter().all(|f| !f.accepted));
    }
}

#[test]
fn resolved_fluid_spacing_and_rhythm_changes_are_reported_at_the_use_site() {
    let mut cfg = config();
    cfg["theme"]["spacing"] = json!({"fluid":{"*":"between(10px-20px)"}, "alias":{"*":"calc(var[fluid] * 2)"}, "rhythm":{"*":"vertical-rhythm(theme.typography.sizes.fluid, 1.6)"}});
    cfg["theme"]["typography"] = json!({"sizes":{"fluid":{"*":"between(18px-22px)"},"plain":{"*":"18px"},"product":{"*":"calc(18px * 2)"}}});
    for (expression, message) in [("alias", "320px"), ("rhythm", "whole resolved")] {
        let source = format!(".x{{\n@space height {expression} mobile;\n}}");
        let mut report =
            migration::analyze(&request(&source, cfg.clone()), LEGACY_VERSION).unwrap();
        assert!(report.analysis_complete, "{report:?}");
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.diagnostic.code, "EU_MIGRATION_SIZE");
        assert_eq!(finding.diagnostic.line, 2);
        assert!(finding.diagnostic.message.contains(message), "{report:?}");
        assert!(finding.fix.is_none());
        let mut review = serde_json::to_value(&report).unwrap();
        review["findings"][0]["accepted"] = true.into();
        migration::apply_acceptances(&mut report, &review.to_string()).unwrap();
        assert!(report.findings[0].accepted);
    }
    for source in [
        ".x{@space width between(10px-20px) desktop}",
        ".x{@space width between(10px-10px) mobile}",
        ".x{@space height vertical-rhythm(theme.typography.sizes.fluid, 1) mobile}",
        ".x{@space height vertical-rhythm(theme.typography.sizes.plain, 1.6) mobile}",
        ".x{@space height vertical-rhythm(theme.typography.sizes.product, 1.6) mobile}",
    ] {
        let report = migration::analyze(&request(source, cfg.clone()), LEGACY_VERSION).unwrap();
        assert!(report.findings.is_empty(), "{source}: {report:?}");
    }
}

#[test]
fn font_modifiers_report_retained_object_properties_including_identity_modifiers() {
    let mut cfg = config();
    cfg["theme"]["typography"] =
        json!({"sizes":{"body":{"*":{"font-size":"20px","font-weight":700,"line-height":1.5}}}});
    for modifier in ["1", "2"] {
        let report = migration::analyze(
            &request(
                &format!(".x{{@fontsize body({modifier}) desktop}}"),
                cfg.clone(),
            ),
            LEGACY_VERSION,
        )
        .unwrap();
        assert_eq!(report.findings.len(), 1, "{report:?}");
        assert_eq!(report.findings[0].diagnostic.code, "EU_MIGRATION_SIZE");
        assert!(report.findings[0]
            .diagnostic
            .message
            .contains("font-weight"));
    }
    let report =
        migration::analyze(&request(".x{@fontsize body desktop}", cfg), LEGACY_VERSION).unwrap();
    assert!(report.findings.is_empty(), "{report:?}");
}

#[test]
fn signed_columns_warn_at_resolved_uses_and_allow_explicit_review() {
    let mut cfg = config();
    cfg["theme"]["columns"] = json!({"gutters":{"*":"20px"}});
    cfg["theme"]["spacing"] = json!({"offset":{"*":"-1/4"}});
    for value in ["-1/4", "offset", "calc(var[offset] + 1px)"] {
        let mut report = migration::analyze(
            &request(
                &format!(".x{{\n@column-offset {value} mobile}}"),
                cfg.clone(),
            ),
            LEGACY_VERSION,
        )
        .unwrap();
        assert!(report.analysis_complete, "{report:?}");
        assert_eq!(report.findings.len(), 1, "{report:?}");
        let finding = &report.findings[0];
        assert_eq!(finding.diagnostic.code, "EU_MIGRATION_COLUMN_SIGN");
        assert_eq!(finding.diagnostic.line, 2);
        assert!(finding
            .diagnostic
            .message
            .contains("calc(-25% - 1.25 * (20px))"));
        assert!(finding.fix.is_none());
        let mut review = serde_json::to_value(&report).unwrap();
        review["findings"][0]["accepted"] = true.into();
        migration::apply_acceptances(&mut report, &review.to_string()).unwrap();
        assert!(report.findings[0].accepted);
    }
    for value in ["negate(1/4)", "-20px", "-2", "calc(-25% - 1.25 * (20px))"] {
        let report = migration::analyze(
            &request(&format!(".x{{@column-offset {value} mobile}}"), cfg.clone()),
            LEGACY_VERSION,
        )
        .unwrap();
        assert!(report.findings.is_empty(), "{report:?}");
    }
}

#[test]
fn repeated_nested_selector_media_overrides_are_reported_across_rule_nodes() {
    // Real mobile news-card regression found by comparing rendered Site A.
    for source in [
        ".news-card{@responsive mobile{.media{flex:0 0 105px}} .media{flex:0 0 auto}}",
        "@media (width < 740px){.news-card .media{flex:0 0 105px}} .news-card .media{flex:0 0 auto}",
        ".news-card{.media{@responsive mobile{flex:0 0 105px}} .media{flex:0 0 auto}}",
        ".news-card{.media{@responsive mobile{&{flex:0 0 105px}} &{flex:0 0 auto}}}",
    ] {
        let report = analyze(source);
        assert!(report.analysis_complete, "{report:?}");
        assert!(report.findings.iter().any(|finding| finding.diagnostic.code == "EU_MIGRATION_ORDER" && finding.diagnostic.message.contains("Repeated selector path") && finding.diagnostic.message.contains("flex-basis: 105px")), "{source}: {report:?}");
    }
    for source in [
        ".news-card{.media{flex:0 0 auto} @responsive mobile{.media{flex:0 0 105px}}}",
        ".news-card{@responsive mobile{.media{flex:0 0 105px}} .other{flex:0 0 auto}}",
        ".news-card{@responsive mobile{.media{flex:0 0 105px}} .media{flex:0 0 auto!important}}",
        "@layer a{.x{@responsive mobile{color:red}}} @layer b{.x{color:blue}}",
        ".x{@responsive mobile{color:red}} .x{@responsive desktop{color:blue}}",
    ] {
        assert!(
            analyze(source).findings.is_empty(),
            "{source}: {:?}",
            analyze(source)
        );
    }
}

#[test]
fn overlapping_width_groups_warn_without_claiming_a_definite_cascade_winner() {
    let source = ".x{@media (width >= 740px) and (width <= 1023px){padding:20px} @media (width <= 1023px){padding:24px}}";
    let report = analyze(source);
    assert!(report.analysis_complete);
    assert_eq!(report.findings.len(), 4, "{report:?}");
    assert!(report
        .findings
        .iter()
        .all(|f| f.diagnostic.message.contains("can favor")));
    let report =
        analyze(".x{@media (width <= 739px){padding:20px} @media (width >= 740px){padding:24px}}");
    assert!(report.findings.is_empty());
}

#[test]
fn legacy_equal_value_grouping_is_considered_before_media_sorting() {
    let mut cfg = config();
    cfg["theme"]["columns"] = json!({"gutters":{"mobile":"16px","tablet":"20px","desktop":"30px"}});
    cfg["theme"]["spacing"] = json!({"lg":{"mobile":"40px","tablet":"40px","desktop":"60px"}});
    let report = migration::analyze(
        &request(".grid{@space gap 1; @space row-gap lg}", cfg),
        LEGACY_VERSION,
    )
    .unwrap();
    assert!(report.analysis_complete);
    assert!(
        report
            .findings
            .iter()
            .any(|f| f.diagnostic.message.contains("row-gap: 20px")
                && f.diagnostic.message.contains("row-gap: 40px")),
        "{report:?}"
    );
}

#[test]
fn adjacent_fallback_fixes_require_review_and_reject_stale_or_forged_decisions() {
    let source = ".hero {\n  @space width 40dpx mobile;\n  width:40px;\n}";
    let report = analyze(source);
    let fix = report.findings.iter().find_map(|f| f.fix.as_ref()).unwrap();
    assert_eq!(fix.kind, "preserve-appearance");
    assert!(
        migration::reviewed_edits(&report, &serde_json::to_string(&report).unwrap())
            .unwrap()
            .is_empty()
    );
    let mut review = serde_json::to_value(&report).unwrap();
    for finding in review["findings"].as_array_mut().unwrap() {
        if !finding["fix"].is_null() {
            finding["apply_fix"] = true.into();
        }
    }
    let edits = migration::reviewed_edits(&report, &review.to_string()).unwrap();
    let fixed = migration::apply_edits(source, "rule.css", &edits).unwrap();
    assert_eq!(
        fixed,
        ".hero {\n  width:40px;\n  @space width 40dpx mobile;\n}"
    );
    assert!(!analyze(&fixed)
        .findings
        .iter()
        .any(|f| f.diagnostic.code == "EU_MIGRATION_ORDER"));
    assert_css(
        &fixed,
        ".hero{width:40px;@media(width <= 739px){width:calc(2.77778vw * var(--ec-zoom))}}",
        config(),
    );
    assert!(
        migration::reviewed_edits(&analyze(&(source.to_owned() + " ")), &review.to_string())
            .is_err()
    );
    // The saved payload cannot inject edits: only a fresh compiler proposal is used.
    review["findings"][0]["fix"]["edits"][0]["replacement"] = "evil".into();
    assert_eq!(
        migration::reviewed_edits(&report, &review.to_string()).unwrap()[0].replacement,
        edits[0].replacement
    );
    review["findings"][0]["message"] = "forged".into();
    assert!(migration::reviewed_edits(&report, &review.to_string()).is_err());
}

#[test]
fn order_fixes_do_not_cross_intervening_rules_comments_or_generated_bodies() {
    for source in [
        ".x{@space width 40dpx mobile; color:red; width:40px;}",
        ".x{@space width 40dpx mobile; /* explains fallback */ width:40px;}",
        "%x{@space width 40dpx mobile;width:40px;}.x{@extend %x}",
        ".x{@responsive mobile{width:30px;} width:40px;}",
    ] {
        let report = analyze(source);
        assert!(
            report.findings.iter().all(|f| f.fix.is_none()),
            "{report:?}"
        );
    }
}

#[test]
fn object_line_height_overrides_warn_only_at_affected_uses() {
    let mut cfg = config();
    cfg["theme"]["typography"] = json!({"sizes":{
        "object":{"*":{"font-size":"20px","line-height":"1.3"}},
        "inherited":{"*":{"font-size":"20px"}},
        "scalar":{"*":"20px/1.3"}
    }});
    for (query, warns) in [
        ("object/1", true),
        ("object/1.3", false),
        ("object", false),
        ("object(2)/1", false),
        ("scalar/1", false),
        ("inherited/1", true),
    ] {
        let report = migration::analyze(
            &request(&format!(".x{{@fontsize {query} tablet;}}"), cfg.clone()),
            LEGACY_VERSION,
        )
        .unwrap();
        assert_eq!(
            report
                .findings
                .iter()
                .any(|f| f.diagnostic.message.contains("ignored this suffix")),
            warns,
            "{report:?}"
        );
    }
}
