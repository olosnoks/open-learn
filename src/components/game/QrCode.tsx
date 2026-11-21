import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { cn } from '../../lib/cn';

function build(value: string): { n: number; d: string } | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { n, d };
  } catch {
    return null;
  }
}

/** Client-side QR code as crisp SVG. Renders nothing if the value cannot be encoded. */
export function QrCode({ value, label, className }: { value: string; label?: string; className?: string }) {
  const qr = useMemo(() => build(value), [value]);
  if (!qr) return null;
  const pad = 2; // quiet zone, in modules
  const size = qr.n + pad * 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `QR code for ${value}`}
      shapeRendering="crispEdges" className={cn('block h-auto w-full', className)}>
      <rect width={size} height={size} fill="#fff" />
      <path d={qr.d} fill="#0B1A0C" transform={`translate(${pad} ${pad})`} />
    </svg>
  );
}
