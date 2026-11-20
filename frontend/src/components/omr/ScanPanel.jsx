import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, RotateCcw, Check, AlertTriangle, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { buildLayout } from './layout.js';
import { Pill, btnPrimary, btnGhost, errMsg } from '../ui';
import { prepareFile, prepareCanvas, cornersInView, SCAN_TONE } from './omrKit';

const TONE = { good: 'text-[#1f6b3a]', warn: 'text-[#8a5a00]', bad: 'text-[#9b2f1d]' };
let seq = 0;

// Photograph or choose answer sheets. Each one is checked on the phone first (corners found? blurry?) and then read again by the server.
export default function ScanPanel({ batchId, form, th, replace, onReplaced, onChanged, disabled }) {
  const layout = React.useMemo(() => buildLayout({ questions: form.questions, choices: form.choices, idDigits: form.idDigits }), [form.questions, form.choices, form.idDigits]);
  const [items, setItems] = useState([]); const [cam, setCam] = useState(false); const [seen, setSeen] = useState(false); const [camErr, setCamErr] = useState('');
  const videoRef = useRef(null); const probe = useRef(null); const stream = useRef(null); const fileRef = useRef(null);
  const patch = (id, p) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const send = useCallback(async (id, dataUrl, source) => {
    patch(id, { state: 'sending', error: '' });
    try { const r = await apiClient.post(`/omr/batches/${batchId}/scans`, { image: dataUrl, source, capturedAt: new Date().toISOString(), rescanOf: replace || undefined }); patch(id, { state: 'done', scan: r.data.scan, dataUrl: '' }); if (replace && onReplaced) onReplaced(); onChanged && onChanged(); }
    catch (e) { patch(id, { state: 'failed', error: errMsg(e, 'Could not send this photo.') }); }
  }, [batchId, replace, onChanged, onReplaced]);

  const take = async (files) => {
    for (const file of files) {
      const id = ++seq; setItems((l) => [{ id, name: file.name || `photo ${id}`, state: 'checking' }, ...l]);
      try { const p = await prepareFile(file, layout, th); patch(id, { dataUrl: p.dataUrl, bytes: p.bytes, check: p.check, state: p.check.tone === 'bad' ? 'held' : 'ready' }); if (p.check.tone !== 'bad') await send(id, p.dataUrl, 'upload'); }
      catch (e) { patch(id, { state: 'failed', error: e.message || 'Could not read this file.' }); }
    }
  };

  // live camera
  const stop = () => { if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; } setCam(false); setSeen(false); };
  const start = async () => {
    setCamErr(''); if (!navigator.mediaDevices?.getUserMedia) { setCamErr('This browser cannot open the camera here. Use "Choose photos" instead.'); return; }
    try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); setCam(true); }
    catch { setCamErr('The camera is not available. Allow camera access, or use "Choose photos" instead.'); }
  };
  useEffect(() => { if (cam && videoRef.current && stream.current) { videoRef.current.srcObject = stream.current; videoRef.current.play().catch(() => {}); } }, [cam]);
  useEffect(() => { if (!cam) return undefined; const t = setInterval(() => { const v = videoRef.current; if (v && v.videoWidth && probe.current) { try { setSeen(cornersInView(v, probe.current)); } catch { /* ignore */ } } }, 800); return () => clearInterval(t); }, [cam]);
  useEffect(() => () => { if (stream.current) stream.current.getTracks().forEach((t) => t.stop()); }, []);
  const snap = async () => {
    const v = videoRef.current; if (!v?.videoWidth) return; const id = ++seq; setItems((l) => [{ id, name: `camera ${id}`, state: 'checking' }, ...l]);
    const p = prepareCanvas(v, v.videoWidth, v.videoHeight, layout, th); patch(id, { dataUrl: p.dataUrl, bytes: p.bytes, check: p.check, state: p.check.tone === 'bad' ? 'held' : 'ready' }); if (p.check.tone !== 'bad') await send(id, p.dataUrl, 'camera'); else toast.error(p.check.msg);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={disabled} onClick={cam ? stop : start}><Camera className="mr-1.5 inline h-4 w-4" aria-hidden="true" />{cam ? 'Close camera' : 'Use the camera'}</button>
        <button className={btnGhost} disabled={disabled} onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 inline h-4 w-4" aria-hidden="true" />Choose photos</button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Choose photos of answer sheets" onChange={(e) => { take([...e.target.files]); e.target.value = ''; }} />
        {replace && <span className="text-xs text-[#8a5a00]">The next photo replaces the sheet that needed a new photo.</span>}
      </div>
      {camErr && <div role="alert" className="rounded-lg bg-[#fbeeea] p-2 text-sm text-[#9b2f1d]">{camErr}</div>}
      {cam && (
        <div className="grid gap-2">
          <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} playsInline muted className="block w-full" aria-label="Camera view" />
            <div aria-hidden="true" className={`pointer-events-none absolute inset-3 rounded-lg border-2 border-dashed ${seen ? 'border-[#49c27a]' : 'border-white/70'}`} />
            <div role="status" className={`absolute bottom-2 left-2 rounded-md px-2 py-1 text-xs font-semibold ${seen ? 'bg-[#1f6b3a] text-white' : 'bg-black/60 text-white'}`}>{seen ? 'All four corners in view' : 'Fit the whole sheet in the frame, flat, with the four black corner marks showing'}</div>
          </div>
          <canvas ref={probe} className="hidden" />
          <div className="flex justify-center"><button className={btnPrimary} onClick={snap}>Take photo</button></div>
        </div>
      )}
      {items.length > 0 && (
        <ul className="grid gap-2" aria-label="Photos in this session">
          {items.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e3e7e7] bg-white p-2 text-sm">
              <span className="font-medium">{x.name}</span>
              {x.state === 'checking' && <span className="text-[#5b6b7b]">Checking…</span>}
              {x.check && x.state !== 'done' && <span className={`${TONE[x.check.tone]} inline-flex items-center gap-1`}>{x.check.tone === 'good' ? <Check className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}{x.check.msg}</span>}
              {x.state === 'sending' && <span className="text-[#5b6b7b]">Sending…</span>}
              {x.state === 'done' && <><Pill value={SCAN_TONE[x.scan.status] || 'None'}>{x.scan.status}</Pill><span>{x.scan.candidate.name || (x.scan.candidate.read ? `Number ${x.scan.candidate.read}` : 'Candidate unknown')}</span>{x.scan.toReview > 0 && <span className="text-[#8a5a00]">{x.scan.toReview} mark{x.scan.toReview > 1 ? 's' : ''} to look at</span>}{x.scan.blocks > 0 && <span className="text-[#8a5a00]">{x.scan.flags.filter((f) => f.level === 'block' && !f.resolved).map((f) => f.code).join(', ')}</span>}</>}
              {x.state === 'failed' && <span role="alert" className="text-[#9b2f1d]">{x.error}</span>}
              <span className="ml-auto flex gap-1">
                {x.state === 'held' && <button className={btnGhost} onClick={() => send(x.id, x.dataUrl, 'upload')}>Send anyway</button>}
                {x.state === 'failed' && x.dataUrl && <button className={btnGhost} onClick={() => send(x.id, x.dataUrl, 'upload')}><RotateCcw className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Try again</button>}
                {x.state !== 'sending' && x.state !== 'checking' && <button aria-label={`Remove ${x.name} from this list`} className="rounded p-1 text-[#5b6b7b] hover:bg-[#f7f6f2]" onClick={() => setItems((l) => l.filter((y) => y.id !== x.id))}><X className="h-4 w-4" /></button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[#5b6b7b]">Photos are read on the school's server. The photo and the straightened page are kept with the batch so a person can always check what was read. Nothing is recorded by the camera except the photos you take.</p>
    </div>
  );
}
