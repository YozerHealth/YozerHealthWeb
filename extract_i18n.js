'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const dict = Object.assign({}, require(path.join(ROOT, 'public/assets/i18n-dict.js')));
// 隐私页专属补丁（若已生成则合并，使校验覆盖 privacy.html）。
// 补丁脚本仅把条目 Object.assign 进 window.YH_DICT（无 module.exports），
// 因此在 Node 下先声明 global.window，加载后从 global.YH_DICT 取合并结果。
global.window = global.window || global;
// 各页专属补丁（生成后自动合并，使校验覆盖对应页面）。
// 补丁脚本仅把条目 Object.assign 进 window.YH_DICT（无 module.exports），
// 因此在 Node 下先声明 global.window，加载后从 global.YH_DICT 取合并结果。
['i18n-dict-privacy.js', 'i18n-dict-psychometric.js', 'i18n-dict-mentalaid.js', 'i18n-dict-apps.js'].forEach(function (patch) {
  try { require(path.join(ROOT, 'public/assets/' + patch)); Object.assign(dict, global.window.YH_DICT || {}); } catch (e) { /* 补丁可选 */ }
});
const ATTRS = ['placeholder', 'title', 'alt', 'aria-label', 'content', 'value'];
const files = ['public/index.html', 'public/yozerhealth.html', 'public/mentalbook.html', 'public/privacy.html', 'public/psychometric.html', 'public/mentalaid.html'];
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const dictNorm = new Set(Object.keys(dict).map(norm));

const texts = new Set();
for (const f of files) {
  let html;
  try { html = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; /* 页面尚未生成 */ }
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  for (const a of ATTRS) {
    const re = new RegExp(a + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'gi');
    let m;
    while ((m = re.exec(html))) {
      const v = m[2] !== undefined ? m[2] : m[3];
      if (v && /[\u4e00-\u9fff]/.test(v)) texts.add(v.trim());
    }
  }
  const parts = html.split(/<[^>]+>/);
  for (const p of parts) {
    const t = norm(p);
    if (t && /[\u4e00-\u9fff]/.test(t)) texts.add(t);
  }
}
const missing = [];
texts.forEach((t) => { if (!dictNorm.has(norm(t))) missing.push(t); });
console.log('TOTAL UNIQUE CJK STRINGS:', texts.size);
console.log('MISSING:', missing.length);
missing.sort().forEach((s) => console.log('  ' + JSON.stringify(s)));
