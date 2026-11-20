// A school's own Urdu wording (PRD E27 localization manager). Looked up before the built-in dictionary.
let map = {};
const subs = new Set();
export const getOverride = (k) => map[k];
export const setOverrides = (m) => { map = m && typeof m === 'object' ? m : {}; subs.forEach((f) => f()); };
export const onOverrides = (f) => { subs.add(f); return () => subs.delete(f); };
export const overrideCount = () => Object.keys(map).length;

// Labels that had no Urdu on screen. Only short label-like text from controls and headings; counted by school, never by person.
const seen = new Set(); let queue = []; let sender = null; let timer = null;
export const setMissingSender = (fn) => { sender = fn; if (!fn) { queue = []; clearTimeout(timer); timer = null; } };
export const reportMissing = (text) => {
  if (!sender || seen.size >= 300 || seen.has(text)) return; seen.add(text); queue.push(text);
  if (!timer) timer = setTimeout(() => { timer = null; const labels = queue.splice(0, 30); if (labels.length && sender) sender(labels); }, 15000);
};
export const resetMissing = () => { seen.clear(); queue = []; };
