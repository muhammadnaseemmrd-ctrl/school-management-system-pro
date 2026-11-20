import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import * as V from './vision.js';

export const BATCH_STEPS = ['Scanning', 'Graded', 'Moderation', 'Approved', 'Published'];
export const SCAN_TONE = { 'Needs review': 'Pending', Ready: 'Approved', Graded: 'Active', Rescan: 'Suspended', Superseded: 'None' };
export const BATCH_TONE = { Scanning: 'Pending', Graded: 'Pending', Moderation: 'Pending', Approved: 'Approved', Published: 'Active' };
export const FORM_TONE = { Draft: 'Pending', Ready: 'Active', Archived: 'None' };
export const STATE_WORDS = { ok: 'Clear', blank: 'Blank', multiple: 'More than one mark', faint: 'Faint mark', low: 'Unsure' };
export const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const num = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

// open a PDF or CSV that needs the sign-in header in a new tab / as a download
export async function fetchBlob(path, type) { const r = await apiClient.get(path, { responseType: 'blob' }); return type ? new Blob([r.data], { type }) : r.data; }
export const openPdf = async (path) => { const b = await fetchBlob(path, 'application/pdf'); const url = URL.createObjectURL(b); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
export const saveBlob = async (path, name) => { const b = await fetchBlob(path); const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); };

// A picture from the server that needs the sign-in header, shown with a normal <img>
export const useBlobUrl = (path) => {
  const [url, setUrl] = useState(''); const [err, setErr] = useState(false);
  useEffect(() => { let dead = false; let made = ''; setUrl(''); setErr(false); if (!path) return undefined;
    apiClient.get(path, { responseType: 'blob' }).then((r) => { if (dead) return; made = URL.createObjectURL(r.data); setUrl(made); }).catch(() => !dead && setErr(true));
    return () => { dead = true; if (made) URL.revokeObjectURL(made); }; }, [path]);
  return { url, err };
};

const MAX_LONG = 1800; const MAX_BYTES = 880 * 1024;
const loadBitmap = (file) => new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture.')); }; img.src = url; });

// Draw any picture (a file or a video frame) at a sensible size, check it with the same reader the server uses, and make the JPEG that gets sent.
export function prepareCanvas(source, sw, sh, layout, th = {}) {
  let scale = Math.min(1, MAX_LONG / Math.max(sw, sh)); let canvas; let dataUrl = ''; let q = 0.85;
  for (let tries = 0; tries < 6; tries++) { canvas = document.createElement('canvas'); canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale); canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height); dataUrl = canvas.toDataURL('image/jpeg', q); if (dataUrl.length * 0.75 <= MAX_BYTES) break; q = Math.max(0.6, q - 0.08); scale *= 0.88; }
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); const gray = V.toGray(px.data, canvas.width, canvas.height); const r = V.process(gray, canvas.width, canvas.height, layout);
  const blurMm = th.blurMm || 0.8; let check;
  if (!r.ok) check = { ok: false, tone: 'bad', msg: 'Corner marks not found. Keep the whole sheet in view, flat, in good light.' };
  else if (r.edgeMm > blurMm) check = { ok: false, tone: 'warn', msg: 'Looks blurry. Hold steady and retake.', edgeMm: r.edgeMm };
  else if (r.contrast < (th.minContrast || 70) || r.paper < (th.minPaper || 90)) check = { ok: false, tone: 'warn', msg: 'Too dark. Use more light.' };
  else check = { ok: true, tone: 'good', msg: 'Looks readable.', edgeMm: r.edgeMm };
  return { dataUrl, bytes: Math.round(dataUrl.length * 0.75), check, w: canvas.width, h: canvas.height };
}
export async function prepareFile(file, layout, th) { const img = await loadBitmap(file); return prepareCanvas(img, img.naturalWidth, img.naturalHeight, layout, th); }
// quick "are the corners in view" test on a small copy of the live camera picture
export function cornersInView(video, canvas) { const w = 640; const h = Math.round(w * video.videoHeight / video.videoWidth); if (!w || !h) return false; canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, w, h); const d = ctx.getImageData(0, 0, w, h); return V.findAnchors(V.toGray(d.data, w, h), w, h).ok; }
