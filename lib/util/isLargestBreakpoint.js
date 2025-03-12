"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = isLargestBreakpoint;
function isLargestBreakpoint(config, breakpoint) {
  const containerBps = config.theme.container.maxWidth;
  const lastKey = [...Object.keys(containerBps)].pop();
  return breakpoint === lastKey;
}