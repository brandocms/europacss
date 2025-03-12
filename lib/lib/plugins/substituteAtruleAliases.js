"use strict";
module.exports = ()=>{
    return {
        postcssPlugin: "europacss-aliases",
        prepare (result) {
            return {
                AtRule: {
                    "column-offset": (atRule)=>{
                        // translates to @space margin-left params
                        atRule.name = "space";
                        atRule.params = `margin-left ${atRule.params}`;
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
