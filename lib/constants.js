"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    cjsConfigFile: function() {
        return cjsConfigFile;
    },
    defaultConfigFile: function() {
        return defaultConfigFile;
    },
    supportedConfigFiles: function() {
        return supportedConfigFiles;
    }
});
const defaultConfigFile = './europa.config.js';
const cjsConfigFile = './europa.config.cjs';
const supportedConfigFiles = [
    cjsConfigFile,
    defaultConfigFile
];
