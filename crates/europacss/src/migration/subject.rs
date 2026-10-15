//! Conservative constraints on the subject compound, using the CSS selector AST.
use lightningcss::{
    rules::CssRule,
    selector::{Combinator, Component, PseudoElement},
    stylesheet::{ParserOptions, StyleSheet},
};
use parcel_selectors::attr::AttrSelectorOperator;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Default)]
pub(super) struct Subject {
    kind: Option<String>,
    id: Option<String>,
    pseudo: Option<&'static str>,
    attributes: BTreeMap<String, String>,
    classes: BTreeSet<String>,
    all_classes: BTreeSet<String>,
}
impl Subject {
    pub fn parse(selector: &str) -> Self {
        let text = format!("{selector}{{color:red}}");
        let Ok(sheet) = StyleSheet::parse(&text, ParserOptions::default()) else {
            return Self::default();
        };
        let [CssRule::Style(style)] = sheet.rules.0.as_slice() else {
            return Self::default();
        };
        let mut result = Self::default();
        // Classes inside functional pseudos are useful review hints, but are
        // never subject constraints: :has(.x) and :not(.x) do not require .x on
        // the element being styled. Parse escapes and attribute strings as CSS.
        let mut pending = vec![&style.selectors.0[0]];
        while let Some(selector) = pending.pop() {
            for component in selector.iter_raw_match_order() {
                match component {
                    Component::Class(name) => {
                        result.all_classes.insert(name.to_string());
                    }
                    Component::Is(list)
                    | Component::Where(list)
                    | Component::Negation(list)
                    | Component::Has(list)
                    | Component::Any(_, list) => pending.extend(list.iter()),
                    _ => {}
                }
            }
        }
        for component in style.selectors.0[0].iter_raw_match_order() {
            match component {
                Component::Combinator(Combinator::PseudoElement) => {}
                Component::Combinator(_) => break,
                Component::LocalName(name) => {
                    result.kind = Some(name.name.to_string().to_ascii_lowercase())
                }
                Component::ID(id) => result.id = Some(id.to_string()),
                Component::Class(name) => {
                    result.classes.insert(name.to_string());
                }
                Component::PseudoElement(PseudoElement::Before) => result.pseudo = Some("before"),
                Component::PseudoElement(PseudoElement::After) => result.pseudo = Some("after"),
                Component::PseudoElement(_) | Component::Part(_) | Component::Slotted(_) => {
                    return Self {
                        all_classes: result.all_classes,
                        ..Self::default()
                    }
                }
                Component::AttributeInNoNamespace {
                    local_name,
                    operator: AttrSelectorOperator::Equal,
                    value,
                    ..
                } => {
                    result.attributes.insert(
                        local_name.to_string().to_ascii_lowercase(),
                        value.to_string(),
                    );
                }
                // Functional pseudos can contain alternatives or ancestor selectors;
                // constraints inside them are deliberately not inferred.
                _ => {}
            }
        }
        result
    }
    pub fn review_priority(&self, other: &Self, important: bool) -> super::OrderReviewPriority {
        let shared_subject_classes: Vec<_> =
            self.classes.intersection(&other.classes).cloned().collect();
        let shared_classes: Vec<_> = self
            .all_classes
            .intersection(&other.all_classes)
            .cloned()
            .collect();
        let (rank, relationship) = if !shared_subject_classes.is_empty() {
            (2, "shared-subject-class")
        } else if self.classes.is_empty() || other.classes.is_empty() {
            (3, "classless-subject")
        } else if !shared_classes.is_empty() {
            (4, "shared-class-elsewhere")
        } else {
            (5, "no-shared-class")
        };
        super::OrderReviewPriority {
            rank: if important { 1 } else { rank },
            relationship: relationship.into(),
            important,
            shared_subject_classes,
            shared_classes,
        }
    }
    pub fn disjoint(&self, other: &Self) -> bool {
        let differs = |a: &Option<String>, b: &Option<String>| {
            a.as_ref()
                .zip(b.as_ref())
                .is_some_and(|(a, b)| !a.eq_ignore_ascii_case(b))
        };
        differs(&self.kind, &other.kind)
            || differs(&self.id, &other.id)
            || self.pseudo.zip(other.pseudo).is_some_and(|(a, b)| a != b)
            || self.attributes.iter().any(|(name, value)| {
                other
                    .attributes
                    .get(name)
                    .is_some_and(|v| !v.eq_ignore_ascii_case(value))
            })
    }
}
