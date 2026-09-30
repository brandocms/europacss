//! Presentation groups never replace findings or participate in review decisions.
use europacss::migration::{Finding, Fix, OrderSource, Report};
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub struct ReviewItem<'a> {
    pub findings: Vec<&'a Finding>,
}
impl ReviewItem<'_> {
    pub fn fixes(&self) -> Vec<&Fix> {
        let mut seen = HashSet::new();
        self.findings
            .iter()
            .filter_map(|f| f.fix.as_ref())
            .filter(|fix| seen.insert(fix.edits.as_slice()))
            .collect()
    }
}

pub fn review_items(report: &Report) -> Vec<ReviewItem<'_>> {
    let mut groups = BTreeMap::<_, Vec<_>>::new();
    for finding in report.findings.iter().filter(|f| !f.accepted) {
        let d = &finding.diagnostic;
        groups
            .entry((&d.filename, d.offset, &d.code))
            .or_default()
            .push(finding);
    }
    groups
        .into_values()
        .map(|findings| ReviewItem { findings })
        .collect()
}

/// A section retains the actual earlier/later condition pair. Combining the two
/// columns independently would invent combinations that were never reported.
pub struct OrderSection<'a> {
    pub earlier_source: &'a OrderSource,
    pub earlier_label: &'a str,
    pub reason: &'a str,
    pub selector_path: &'a [String],
    pub conditions: BTreeSet<(&'a [String], &'a [String])>,
    pub values: Vec<(&'a str, &'a str)>,
}
pub fn order_sections<'a>(item: &ReviewItem<'a>) -> Vec<OrderSection<'a>> {
    let mut rows = BTreeMap::new();
    for order in item.findings.iter().filter_map(|f| f.order.as_ref()) {
        let key = (
            &order.earlier_source,
            order.earlier_label.as_str(),
            order.reason.as_str(),
            order.selector_path.as_slice(),
            order.earlier.as_str(),
            order.later.as_str(),
        );
        rows.entry(key).or_insert_with(BTreeSet::new).insert((
            order.earlier_conditions.as_slice(),
            order.later_conditions.as_slice(),
        ));
    }
    // Properties with exactly the same scope pairs share a breakpoint heading.
    let mut sections = BTreeMap::new();
    for ((source, label, reason, selectors, earlier, later), conditions) in rows {
        sections
            .entry((source, label, reason, selectors, conditions))
            .or_insert_with(Vec::new)
            .push((earlier, later));
    }
    sections
        .into_iter()
        .map(
            |((earlier_source, earlier_label, reason, selector_path, conditions), values)| {
                OrderSection {
                    earlier_source,
                    earlier_label,
                    reason,
                    selector_path,
                    conditions,
                    values,
                }
            },
        )
        .collect()
}

pub fn appearance_proposals(items: &[ReviewItem<'_>]) -> usize {
    items
        .iter()
        .flat_map(|item| &item.findings)
        .filter_map(|f| f.fix.as_ref())
        .filter(|f| f.kind == "preserve-appearance")
        .map(|f| f.edits.as_slice())
        .collect::<HashSet<_>>()
        .len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use europacss::{migration, Request};

    #[test]
    fn grouping_preserves_origins_and_condition_pairs_without_inventing_conflicts() {
        let report = migration::analyze(
            &Request {
                source: ".x { @space padding 1 xs/sm; @space padding 2 xs/sm; padding:12px; }
                    @media (width < 740px) { .x { margin:20px; } }
                    @media (width < 1024px) { .x { margin:24px; } }"
                    .into(),
                filename: "test.css".into(),
                config: europacss::resolve_config(serde_json::json!({})).unwrap(),
                ..Request::default()
            },
            migration::LEGACY_VERSION,
        )
        .unwrap();
        assert!(report.analysis_complete, "{report:?}");
        let items = review_items(&report);
        assert!(items.iter().any(|item| {
            order_sections(item)
                .iter()
                .map(|section| section.earlier_source)
                .collect::<BTreeSet<_>>()
                .len()
                > 1
        }));
        let original: BTreeSet<_> = report
            .findings
            .iter()
            .filter_map(|finding| finding.order.as_ref())
            .map(|order| {
                serde_json::to_string(&(
                    &order.earlier_source,
                    &order.earlier_label,
                    &order.reason,
                    &order.selector_path,
                    (&order.earlier_conditions, &order.later_conditions),
                    (&order.earlier, &order.later),
                ))
                .unwrap()
            })
            .collect();
        assert!(original.len() >= 20);
        let mut displayed = BTreeSet::new();
        for item in &items {
            for section in order_sections(item) {
                for conditions in &section.conditions {
                    for values in &section.values {
                        displayed.insert(
                            serde_json::to_string(&(
                                section.earlier_source,
                                section.earlier_label,
                                section.reason,
                                section.selector_path,
                                conditions,
                                values,
                            ))
                            .unwrap(),
                        );
                    }
                }
            }
        }
        assert_eq!(original, displayed);
    }
}
