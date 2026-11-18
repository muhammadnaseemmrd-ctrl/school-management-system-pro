import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

// Draws the rotating classroom code as a QR picture. Nothing leaves the browser.
const QrCode = ({ value, size = 220 }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && value) QRCode.toCanvas(ref.current, value, { width: size, margin: 1, color: { dark: '#1B2837', light: '#FFFFFF' } }).catch(() => {}); }, [value, size]);
  return <canvas ref={ref} width={size} height={size} role="img" aria-label="Classroom check-in code" className="rounded-lg border border-[#e3e7e7]" />;
};
export default QrCode;
