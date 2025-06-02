"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get cjsConfigFile () {
        return cjsConfigFile;
    },
    get defaultConfigFile () {
        return defaultConfigFile;
    },
    get supportedConfigFiles () {
        return supportedConfigFiles;
    }
});
const defaultConfigFile = './europa.config.js';
const cjsConfigFile = './europa.config.cjs';
const supportedConfigFiles = [
    cjsConfigFile,
    defaultConfigFile
];
