import React from 'react';
import { ExternalLink } from 'lucide-react';

// Turns plain text into paragraphs where web links (http/https/www) are clickable.
const URL_RX = /((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

export const linkify = (text = '') => {
  const out = [];
  let last = 0; let m; let i = 0;
  URL_RX.lastIndex = 0;
  while ((m = URL_RX.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
    out.push(
      <a key={`l${i++}`} href={href} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-[#0369a1] underline decoration-dotted underline-offset-2">
        {m[0]}<ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

export const extractLinks = (text = '') => Array.from(new Set((text.match(URL_RX) || []).map((u) => (u.startsWith('http') ? u : `https://${u}`))));

const RichText = ({ text, className = '' }) => (
  <p className={`whitespace-pre-line break-words ${className}`}>{linkify(text)}</p>
);
export default RichText;
