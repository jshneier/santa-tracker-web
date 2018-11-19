const fsp = require('./fsp.js');
const dom = require('./dom.js');
const {minify} = require('html-minifier');
const terser = require('terser');


const emptyFunc = () => {};


function compileHtml(raw) {
  const mo = {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    includeAutoGeneratedTags: false,
    keepClosingSlash: true,
    minifyCSS: true,
    minifyJS: (code) => {
      // nb. html-minifier does NOT see scripts of `type="module"`, which is fine for now as they
      // should be compiled away only in production anyway.
      const result = terser.minify(code);
      if (result.error) {
        throw new Error(`terser error: ${result.error}`);
      }
      return result.code;
    },
    removeRedundantAttributes: true,
    sortAttributes: true,
    sortClassName: true,
  };
  return minify(raw, mo);
}


/**
 * Apply the given attribute to the passed Node.
 *
 * @param {!Node} node 
 * @param {string} attrName 
 * @param {(string|number|boolean|null)=} value 
 */
function applyAttribute(node, attrName, value=true) {
  if (value != null || value !== false) {
    node.setAttribute(attrName, value === true ? '' : '' + value);
  } else {
    node.removeAttribute(attrName);
  }
}


/**
 * @param {!Array<string>} qs
 * @param {string} attrName
 * @param {(string|number|boolean|null)=} value
 * @return {!Array<string>} qs that did not match any
 */
function applyAttributeToAll(node, qs, attrName, value=true) {
  const out = [];
  qs.forEach((q) => {
    const nodes = node.querySelectorAll(qs);
    if (nodes.length === 0) {
      out.push(q);
    }
    nodes.forEach((node) => applyAttribute(node, attrName, value));
  });
}


/**
 * Apply the given i18n string to the passed Node.
 *
 * @param {?string} string 
 * @param {!Node} node 
 */
function applyToNode(string, node) {
  if (node.localName === 'meta') {
    if (string === null) {
      node.removeAttribute('content');
    } else {
      node.setAttribute('content', string);
    }
  } else if (node.closest('head') && node.localName !== 'title') {
    throw new Error(`unhandled <head> node: ${node.localName}`);
  } else {
    node.innerHTML = (string !== null ? string : '');
  }
}


/**
 * Builds a helper that applies the specified language to the passed document.
 *
 * @param {!Document} document 
 * @return {function((function(string): string|null)): string}
 */
function buildApplyLang(document) {
  const messagesNodeMap = new Map();
  document.querySelectorAll('[msgid]').forEach((node) => {
    messagesNodeMap.set(node, node.getAttribute('msgid'));
    node.removeAttribute('msgid');
  });
  const applyMessages = (messages, lang) => {
    // set <html lang="...">
    applyAttribute(document.documentElement, 'lang', lang);
    messagesNodeMap.forEach((msgid, node) => {
      const string = (messages ? messages(msgid) : '');
      applyToNode(string, node);
    });
  };
  return (messages, rewriter=emptyFunc) => {
    const lang = messages(null);
    applyMessages(messages, lang);
    rewriter(document, lang);
    const out = dom.serialize(document);
    applyMessages();
    return out;
  };
} 


module.exports = {
  applyAttribute,
  applyAttributeToAll,

  async static(document) {
    const applyLang = buildApplyLang(document);
    return (messages) => {
      const out = applyLang(messages);
      return compileHtml(out);
    };
  },

  async prod(filename, rewriter=emptyFunc) {
    const raw = await fsp.readFile(filename, 'utf8');
    const source = compileHtml(raw);
    const document = dom.parse(source);

    await rewriter(document);

    return buildApplyLang(document);
  },

};
