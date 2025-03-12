"use strict";

var _postcss = _interopRequireDefault(require("postcss"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
module.exports = getConfig => {
  return {
    postcssPlugin: 'europacss-row',
    prepare() {
      return {
        AtRule: {
          row: atRule => {
            processRule(atRule);
          }
        }
      };
    }
  };
};
module.exports.postcss = true;
function processRule(atRule) {
  throw atRule.error(`
    ROW: Deprecated.

    Use

        @display flex/row/wrap;
        @space gap 1;

    or even

        @display flex/row/wrap;
        @space column-gap 1;
        @space row-gap 1;
  `);
}