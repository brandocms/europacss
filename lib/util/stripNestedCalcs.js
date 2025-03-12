"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return stripNestedCalcs;
    }
});
function stripNestedCalcs(str) {
    return modifyString(str);
}
/**
 *
 * @param string
 * @returns {*}
 */ function modifyString(string) {
    const indices = getIndicesOf("calc", string);
    const markedAsRemovable = markNestedOccurences(string, indices, "(", ")");
    const removable = markedAsRemovable.filter((item)=>item.keepThis === false);
    if (removable.length > 0) {
        return sliceString(string, removable, "calc");
    }
    return string;
}
/**
 *
 * https://stackoverflow.com/a/3410557
 * @param searchStr
 * @param str
 * @param caseSensitive
 * @returns {Array}
 */ function getIndicesOf(searchStr, str, caseSensitive) {
    const searchStrLen = searchStr.length;
    if (searchStrLen === 0) {
        return [];
    }
    let startIndex = 0;
    let index;
    const indices = [];
    if (!caseSensitive) {
        str = str.toLowerCase();
        searchStr = searchStr.toLowerCase();
    }
    while((index = str.indexOf(searchStr, startIndex)) > -1){
        // indices.push(index)
        const indiceObj = {};
        indiceObj.indice = index;
        indices.push(indiceObj);
        startIndex = index + searchStrLen;
    }
    return indices;
}
/** Function that count occurrences of a substring in a string
 * @param {String} string               The string
 * @param {String} subString            The sub string to search for
 * @param {Boolean} [allowOverlapping]  Optional. (Default:false)
 *
 * @author Vitim.us https://gist.github.com/victornpb/7736865
 * @see Unit Test https://jsfiddle.net/Victornpb/5axuh96u/
 * @see http://stackoverflow.com/questions/4009756/
 * how-to-count-string-occurrence-in-string/7924240#7924240
 */ function occurrences(string, subString, allowOverlapping) {
    string += "";
    subString += "";
    if (subString.length <= 0) return string.length + 1;
    let n = 0;
    let pos = 0;
    const step = allowOverlapping ? 1 : subString.length;
    while(true){
        pos = string.indexOf(subString, pos);
        if (pos >= 0) {
            ++n;
            pos += step;
        } else break;
    }
    return n;
}
/**
 * Here we add the keepThis property and value to the indices object
 * whether it is nested between delimiter1 and delimiter2
 * @param string
 * @param indices
 * @param delimiter1
 * @param delimiter2
 * @returns {*}
 */ function markNestedOccurences(string, indices, delimiter1, delimiter2) {
    let lastTrueIndice = null;
    // disable prefer-for-of
    /* eslint-disable */ for(let i = 0; i < indices.length; i++){
        /* eslint-enable */ if (i === 0) {
            indices[i].keepThis = true;
            lastTrueIndice = indices[i].indice;
        } else {
            const stringBetween = string.slice(lastTrueIndice, indices[i].indice);
            indices[i].keepThis = occurrences(stringBetween, delimiter1) === occurrences(stringBetween, delimiter2);
            // if true set lastTrueIndice to current
            if (indices[i].keepThis) {
                lastTrueIndice = indices[i].indice;
            }
        }
    }
    return indices;
}
/**
 *
 * @param string
 * @param indices
 * @param substring
 * @returns {string}
 */ function sliceString(string, indices, substring) {
    let newString = "";
    for(let i = 0; i < indices.length; i++){
        if (i === 0) {
            newString = string.slice(0, indices[i].indice);
            if (i === indices.length - 1) {
                newString += string.slice(indices[i].indice + substring.length, string.length);
            }
        } else if (i === indices.length - 1) {
            newString += string.slice(indices[i - 1].indice + substring.length, indices[i].indice);
            newString += string.slice(indices[i].indice + substring.length, string.length);
        } else {
            newString += string.slice(indices[i - 1].indice + substring.length, indices[i].indice);
        }
    }
    return newString;
}
