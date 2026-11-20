// Reading one uploaded photograph on the server (the authoritative reading; the phone's own check is only for quick feedback).
const jpeg = require('jpeg-js');
const crypto = require('crypto');
const V = require('./vision');
const E = require('./engine');

const MAX_BYTES = 900 * 1024;
function decodeUpload(s) {
  const m = /^data:image\/(jpeg|jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(s || '')); if (!m) return { error: 'Send the photo as a JPEG.' };
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64'); if (buf.length < 2000) return { error: 'The photo is empty.' }; if (buf.length > MAX_BYTES) return { error: 'The photo is too large. It should be under 900 KB.' };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return { error: 'This does not look like a JPEG photo.' };
  return { buf, hash: crypto.createHash('sha256').update(buf).digest('hex') };
}

const grayJpeg = (gray, w, h, q = 78) => { const rgba = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i]; rgba[i * 4 + 3] = 255; } return jpeg.encode({ data: rgba, width: w, height: h }, q).data; };

function readSheet(buf, layout, th) {
  let dec; try { dec = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 14 }); } catch (e) { return { ok: false, reason: 'decode', widthPx: 0, heightPx: 0 }; }
  const gray = V.toGray(dec.data, dec.width, dec.height); const r = V.process(gray, dec.width, dec.height, layout);
  if (!r.ok) return { ok: false, reason: r.reason, widthPx: dec.width, heightPx: dec.height };
  const answers = r.fills.q.map((f, i) => { const x = E.readRow(f, layout.letters, th); return { q: i + 1, det: x.det, state: x.state, conf: x.conf, final: '', by: 'auto' }; });
  const id = E.readDigits(r.fills.id, th); const form = E.readDigits(r.fills.form, th);
  const measure = { rotationDeg: r.rotationDeg, perspective: r.perspective, edgeMm: r.edgeMm, alignMm: r.alignMm, paper: r.paper, ink: r.ink, contrast: r.contrast, widthPx: dec.width, heightPx: dec.height };
  return { ok: true, measure, fills: r.fills, answers, id, form, rect: grayJpeg(r.rect.data, r.rect.w, r.rect.h) };
}
module.exports = { decodeUpload, readSheet, grayJpeg, MAX_BYTES };
