"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.dim = dim;
var _picocolors = _interopRequireDefault(require("picocolors"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
let alreadyShown = new Set();
function log(type, messages, key) {
  if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID) return;
  if (key && alreadyShown.has(key)) return;
  if (key) alreadyShown.add(key);
  console.warn('');
  messages.forEach(message => console.warn(type, '-', message));
}
function dim(input) {
  return _picocolors.default.dim(input);
}
var _default = exports.default = {
  info(key, messages) {
    log(_picocolors.default.bold(_picocolors.default.cyan('info')), ...(Array.isArray(key) ? [key] : [messages, key]));
  },
  warn(key, messages) {
    log(_picocolors.default.bold(_picocolors.default.yellow('warn')), ...(Array.isArray(key) ? [key] : [messages, key]));
  },
  risk(key, messages) {
    log(_picocolors.default.bold(_picocolors.default.magenta('risk')), ...(Array.isArray(key) ? [key] : [messages, key]));
  }
};