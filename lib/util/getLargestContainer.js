"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return getLargestContainer;
    }
});
function getLargestContainer(config) {
    const containerBps = config.theme.container.maxWidth;
    const lastKey = [
        ...Object.keys(containerBps)
    ].pop();
    return containerBps[lastKey];
}
