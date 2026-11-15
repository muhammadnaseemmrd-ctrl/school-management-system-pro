// The older admin/teacher/student screens contain hundreds of plain English labels.
// While Urdu is selected this walks the page text and swaps any label that has an Urdu entry in the dictionary.
// Screens written with t() are translated directly; this only covers the remainder. Original text is kept
// so switching back to English restores it exactly.
import ur from './ur';

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const textRec = new WeakMap(); // text node -> { en, ur }
const attrRec = new WeakMap(); // element -> { attr: { en, ur } }

const PATTERNS = [
  [/^Welcome,\s*(.+)$/i, (m) => `خوش آمدید، ${m[1]}`],
  [/^Std\s+(\S+)\s*\(([^)]+)\)$/i, (m) => `جماعت ${m[1]} (${m[2]})`],
  [/^Up to (\d+) students$/, (m) => `${m[1]} طلبہ تک`],
  [/^Up to (\d+) teachers$/, (m) => `${m[1]} اساتذہ تک`],
  [/^Start with (.+)$/, (m) => `${ur[m[1]] || m[1]} سے شروع کریں`],
  [/^(\d+)% off$/, (m) => `${m[1]}% رعایت`],
  [/^Rs ([\d,]+) off$/, (m) => `${m[1]} روپے رعایت`],
  [/^Rs ([\d,.]+[MK]?)$/, (m) => `${m[1]} روپے`],
];

const lookup = (raw) => {
  const lead = raw.match(/^\s*/)[0];
  const trail = raw.match(/\s*$/)[0];
  const core = raw.trim();
  if (!core) return null;
  if (ur[core]) return lead + ur[core] + trail;
  for (const [re, fn] of PATTERNS) { const m = core.match(re); if (m) return lead + fn(m) + trail; }
  const m = core.match(/^(.*?)(\s*[:*]+)$/); // "Date *" / "Name:"
  if (m && ur[m[1]]) return lead + ur[m[1]] + m[2] + trail;
  return null;
};

const skipped = (el) => !el || SKIP.has(el.tagName) || el.closest('[data-no-i18n]');

const translateText = (node) => {
  const rec = textRec.get(node);
  if (rec && node.nodeValue === rec.ur) return;
  const out = lookup(node.nodeValue);
  if (out && out !== node.nodeValue) { textRec.set(node, { en: node.nodeValue, ur: out }); node.nodeValue = out; }
};

const translateAttrs = (el) => {
  if (el.nodeType !== 1 || skipped(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const rec = attrRec.get(el)?.[a];
    if (rec && v === rec.ur) continue;
    const out = lookup(v);
    if (out && out !== v) {
      const all = attrRec.get(el) || {};
      all[a] = { en: v, ur: out };
      attrRec.set(el, all);
      el.setAttribute(a, out);
    }
  }
};

const walk = (root) => {
  if (root.nodeType === 3) { if (!skipped(root.parentElement)) translateText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  translateAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === 3) { if (!skipped(n.parentElement)) translateText(n); } else translateAttrs(n);
    n = tw.nextNode();
  }
};

const restore = (root) => {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === 3) {
      const rec = textRec.get(n);
      if (rec && n.nodeValue === rec.ur) n.nodeValue = rec.en;
      textRec.delete(n);
    } else {
      const all = attrRec.get(n);
      if (all) { for (const a of Object.keys(all)) if (n.getAttribute(a) === all[a].ur) n.setAttribute(a, all[a].en); attrRec.delete(n); }
    }
    n = tw.nextNode();
  }
};

let observer = null;
let queued = false;
let pending = new Set();

export const startAutoTranslate = () => {
  if (observer) return;
  walk(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') pending.add(m.target);
      else if (m.type === 'attributes') pending.add(m.target);
      else m.addedNodes.forEach((n) => pending.add(n));
    }
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const batch = pending; pending = new Set();
      observer && observer.disconnect();
      batch.forEach((n) => { if (n.isConnected) walk(n); });
      observer && observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
};

export const stopAutoTranslate = () => {
  if (observer) { observer.disconnect(); observer = null; }
  pending = new Set();
  restore(document.body);
};
