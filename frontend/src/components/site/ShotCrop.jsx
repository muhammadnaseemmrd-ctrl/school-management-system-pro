import React from 'react';

// Shows one piece of a real screenshot (a card cut out of the demo school), at a size you choose.
// x, y, w, h describe the piece in the original 1360 x 860 image.
export default function ShotCrop({ shot, x, y, w, h, scale = 0.5, className = '', label }) {
  return (
    <div dir="ltr" className={`overflow-hidden ${className}`} style={{ width: Math.round(w * scale), height: Math.round(h * scale) }} role="img" aria-label={label}>
      <img src={`/showcase/${shot}.webp`} alt="" width={1360} height={860} loading="lazy" decoding="async" draggable="false"
        style={{ width: 1360 * scale, height: 860 * scale, maxWidth: 'none', marginLeft: -x * scale, marginTop: -y * scale }} />
    </div>
  );
}
