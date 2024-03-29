"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _lodash = _interopRequireDefault(require("lodash"));

var _postcss = _interopRequireDefault(require("postcss"));

var _buildDecl = _interopRequireDefault(require("../../util/buildDecl"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Aliases and shortcuts to other at-rules
 */
var _default = _postcss.default.plugin('europacss-row', getConfig => {
  const config = getConfig();
  const {
    theme: {
      breakpoints,
      breakpointCollections
    }
  } = config;
  return function (css) {
    const finalRules = [];
    css.walkAtRules('row', atRule => {
      const src = atRule.source;
      let selector;
      let wrapInResponsive = false;
      let wrapRow = 'nowrap';
      let gap = null;
      const parent = atRule.parent;
      let grandParent = atRule.parent.parent;

      if (parent.type === 'root') {
        throw atRule.error(`ROW: Can only be used inside a rule, not on root.`);
      }

      if (atRule.nodes) {
        throw atRule.error(`ROW: Row should not include children.`);
      }

      let childSpec = '1';

      let [rowCount = null, bpQuery = null] = _postcss.default.list.space(atRule.params);

      if (bpQuery) {
        wrapInResponsive = true;
      }

      if (atRule.params) {
        childSpec = `${parseInt(rowCount)}n+1`;

        if (rowCount && rowCount.indexOf('/') > -1) {
          [rowCount, wrapRow, gap] = rowCount.split('/');
        }
      }

      let clonedRule = atRule.clone(); // Check if we're nested under a @responsive rule.
      // If so, we don't create a media query, and we also won't
      // accept a query param for @space

      if (parent.type === 'atrule' && parent.name === 'responsive') {
        if (bpQuery) {
          throw clonedRule.error(`ROW: When nesting @row under @responsive, we do not accept a breakpoints query.`, {
            name: bpQuery
          });
        }

        bpQuery = parent.params;

        if (grandParent.selector) {
          selector = grandParent.selector;
        }
      } else if (grandParent.name === 'responsive') {
        // check if grandparent is @responsive
        if (bpQuery) {
          throw clonedRule.error(`ROW: When nesting @row under @responsive, we do not accept a breakpoints query.`, {
            name: bpQuery
          });
        }

        bpQuery = grandParent.params;

        if (parent.selector[0] === '&') {
          selector = parent.selector.replace('&', grandParent.parent.selector);
        } else {
          selector = parent.selector;
        }
      }

      if (!selector && parent.selector) {
        selector = parent.selector;
      }

      const decls = [(0, _buildDecl.default)('display', 'flex'), (0, _buildDecl.default)('flex-wrap', wrapRow)];

      const decendentChildren = _postcss.default.rule({
        selector: '> *'
      }); // all decendents should have margin-left 1


      const spaceMarginParams = 'margin-left 1';

      const spaceMarginRule = _postcss.default.atRule({
        name: 'space',
        params: spaceMarginParams
      }); // first child in every row should have no margin-left


      const nthChild = _postcss.default.rule({
        selector: `&:nth-child(${childSpec})`
      });

      nthChild.append((0, _buildDecl.default)('margin-left', '0'));
      decendentChildren.append(spaceMarginRule);
      decendentChildren.append(nthChild);

      if (gap) {
        // all decendents should have margin-top
        const spaceGapParams = `margin-top ${gap}`;

        const spaceGapRule = _postcss.default.atRule({
          name: 'space',
          params: spaceGapParams
        }); // except for ${rowCount}


        const exceptedGapSelectors = [];

        for (let x = 1; x <= rowCount; x += 1) {
          exceptedGapSelectors.push(`&:nth-child(${x})`);
        }

        const exceptedGapSelector = exceptedGapSelectors.join(', ');

        const exceptedGapRule = _postcss.default.rule({
          selector: exceptedGapSelector
        });

        exceptedGapRule.append((0, _buildDecl.default)('margin-top', '0'));
        decendentChildren.append(spaceGapRule);
        decendentChildren.append(exceptedGapRule);
      }

      if (wrapInResponsive) {
        const responsiveRule = _postcss.default.atRule({
          name: 'responsive',
          params: bpQuery
        });

        responsiveRule.source = src;
        responsiveRule.append(...decls);
        responsiveRule.append(decendentChildren);
        parent.insertBefore(atRule, responsiveRule);
      } else {
        parent.prepend(...decls);
        parent.insertAfter(atRule, decendentChildren);
      }

      atRule.remove();
    });
  };
});

exports.default = _default;