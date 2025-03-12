"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return isLargestBreakpoint;
    }
});
function isLargestBreakpoint(config, breakpoint) {
    const containerBps = config.theme.container.maxWidth;
    const lastKey = [
        ...Object.keys(containerBps)
    ].pop();
    return breakpoint === lastKey;
}
