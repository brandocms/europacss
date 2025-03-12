"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getLargestContainer;
function getLargestContainer(config) {
  const containerBps = config.theme.container.maxWidth;
  const lastKey = [...Object.keys(containerBps)].pop();
  return containerBps[lastKey];
}