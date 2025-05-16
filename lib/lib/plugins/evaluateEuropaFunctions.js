"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcssfunctions = /*#__PURE__*/ _interop_require_default(require("postcss-functions"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _default(getConfig) {
    return (0, _postcssfunctions.default)({
        functions: {
            theme: (path, ...defaultValue)=>{
                const config = getConfig();
                return _lodash.default.thru(_lodash.default.get(config.theme, _lodash.default.trim(path, `'"`), defaultValue), (value)=>{
                    return Array.isArray(value) ? value.join(', ') : value;
                });
            },
            ease: (type = 'ease')=>{
                const easings = {
                    // Standard
                    ease: 'cubic-bezier(0.25, 0.1, 0.25, 1.0)',
                    'ease.in': 'cubic-bezier(0.42, 0.0, 1.0, 1.0)',
                    'ease.out': 'cubic-bezier(0.0, 0.0, 0.58, 1.0)',
                    'ease.inOut': 'cubic-bezier(0.42, 0.0, 0.58, 1.0)',
                    // Sine
                    'sine.in': 'cubic-bezier(0.47, 0, 0.745, 0.715)',
                    'sine.out': 'cubic-bezier(0.39, 0.575, 0.565, 1)',
                    'sine.inOut': 'cubic-bezier(0.445, 0.05, 0.55, 0.95)',
                    // Quad
                    'quad.in': 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
                    'quad.out': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    'quad.inOut': 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
                    // Cubic
                    'cubic.in': 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
                    'cubic.out': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
                    'cubic.inOut': 'cubic-bezier(0.645, 0.045, 0.355, 1)',
                    // Quart
                    'quart.in': 'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
                    'quart.out': 'cubic-bezier(0.165, 0.84, 0.44, 1)',
                    'quart.inOut': 'cubic-bezier(0.77, 0, 0.175, 1)',
                    // Quint
                    'quint.in': 'cubic-bezier(0.755, 0.05, 0.855, 0.06)',
                    'quint.out': 'cubic-bezier(0.23, 1, 0.32, 1)',
                    'quint.inOut': 'cubic-bezier(0.86, 0, 0.07, 1)',
                    // Expo
                    'expo.in': 'cubic-bezier(0.95, 0.05, 0.795, 0.035)',
                    'expo.out': 'cubic-bezier(0.19, 1, 0.22, 1)',
                    'expo.inOut': 'cubic-bezier(1, 0, 0, 1)',
                    // Circ
                    'circ.in': 'cubic-bezier(0.6, 0.04, 0.98, 0.335)',
                    'circ.out': 'cubic-bezier(0.075, 0.82, 0.165, 1)',
                    'circ.inOut': 'cubic-bezier(0.785, 0.135, 0.15, 0.86)',
                    // Back
                    'back.in': 'cubic-bezier(0.6, -0.28, 0.735, 0.045)',
                    'back.out': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    'back.inOut': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    // Power1 (same as Quad)
                    'power1.in': 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
                    'power1.out': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    'power1.inOut': 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
                    // Power2 (same as Cubic)
                    'power2.in': 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
                    'power2.out': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
                    'power2.inOut': 'cubic-bezier(0.645, 0.045, 0.355, 1)',
                    // Power3 (same as Quart)
                    'power3.in': 'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
                    'power3.out': 'cubic-bezier(0.165, 0.84, 0.44, 1)',
                    'power3.inOut': 'cubic-bezier(0.77, 0, 0.175, 1)',
                    // Power4 (same as Quint)
                    'power4.in': 'cubic-bezier(0.755, 0.05, 0.855, 0.06)',
                    'power4.out': 'cubic-bezier(0.23, 1, 0.32, 1)',
                    'power4.inOut': 'cubic-bezier(0.86, 0, 0.07, 1)'
                };
                // Clean up the input by removing quotes and trimming
                const cleanType = _lodash.default.trim(type, `'"`);
                // Throw error if the easing type doesn't exist
                if (!easings[cleanType]) {
                    throw new Error(`Invalid easing function: '${cleanType}'. Available options: ${Object.keys(easings).join(', ')}`);
                }
                return easings[cleanType];
            }
        }
    });
}
