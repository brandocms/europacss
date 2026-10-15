//! Conservative constraints on the subject compound, using the CSS selector AST.
use lightningcss::{
    rules::CssRule,
    selector::{Combinator, Component, PseudoElement},
    stylesheet::{ParserOptions, StyleSheet},
};
use parcel_selectors::attr::AttrSelectorOperator;
use std::collections::BTreeMap;

#[derive(Clone, Default)]
pub(super) struct Subject {
    kind: Option<String>,
    id: Option<String>,
    pseudo: Option<&'static str>,
    attributes: BTreeMap<String, String>,
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
        for component in style.selectors.0[0].iter_raw_match_order() {
            match component {
                Component::Combinator(Combinator::PseudoElement) => {}
                Component::Combinator(_) => break,
                Component::LocalName(name) => {
                    result.kind = Some(name.name.to_string().to_ascii_lowercase())
                }
                Component::ID(id) => result.id = Some(id.to_string()),
                Component::PseudoElement(PseudoElement::Before) => result.pseudo = Some("before"),
                Component::PseudoElement(PseudoElement::After) => result.pseudo = Some("after"),
                Component::PseudoElement(_) | Component::Part(_) | Component::Slotted(_) => {
                    return Self::default()
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
