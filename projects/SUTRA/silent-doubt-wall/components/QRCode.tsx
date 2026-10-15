"use client";

import { useEffect, useState } from "react";

interface QRCodeDisplayProps {
  /** The URL (or text) to encode. Pass null when the URL is not yet known. */
  value: string | null;
  /** Size in pixels for the square canvas. Default 200. */
  size?: number;
  /** Class applied to the wrapper div. */
  className?: string;
}

/**
 * Renders a QR code for the given URL using the `qrcode` npm package.
 *
 * Design decisions:
 * - Renders as SVG string (no canvas element needed, works in SSR-aware clients)
 * - Shows a placeholder grid when `value` is null — we never fabricate a URL
 * - Error-state is surfaced as a readable message rather than a broken image
 */
export function QRCodeDisplay({ value, size = 200, className = "" }: QRCodeDisplayProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;

    let cancelled = false;

    import("qrcode").then((QRCode) => {
      QRCode.toString(value, {
        type: "svg",
        width: size,
        margin: 1,
        color: { dark: "#18181A", light: "#FAFAF8" },
        errorCorrectionLevel: "M",
      })
        .then((result) => {
          if (!cancelled) setSvg(result);
        })
        .catch(() => {
          if (!cancelled) setError("QR code could not be generated");
        });
    });

    return () => { cancelled = true; };
  }, [value, size]);

  // Not yet configured — show an explanatory placeholder, not a fake QR
  if (!value) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface text-center p-4 ${className}`}
        style={{ width: size, height: size }}
        aria-label="QR code unavailable — app URL not configured"
      >
        <PlaceholderGrid size={size} />
        <p className="mt-3 text-xs text-ink-faint leading-tight max-w-[130px]">
          Set <code className="font-mono bg-surface-2 px-1 rounded">NEXT_PUBLIC_APP_URL</code> to generate QR
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-rose-light bg-rose-light text-rose text-sm p-4 ${className}`}
        style={{ width: size, height: size }}
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (!svg) {
    // Loading state — skeleton with matching size
    return (
      <div
        className={`animate-pulse rounded-xl bg-surface-2 ${className}`}
        style={{ width: size, height: size }}
        aria-label="Generating QR code…"
        role="status"
      />
    );
  }

  return (
    <div
      className={`rounded-xl overflow-hidden border border-border shadow-sm ${className}`}
      style={{ width: size, height: size }}
      aria-label={`QR code linking to ${value}`}
      // SVG is purely presentational; screen readers should use the label above
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * A decorative placeholder that looks like a QR code without encoding
 * any URL, so we never fabricate a non-functional link.
 */
function PlaceholderGrid({ size }: { size: number }) {
  // 7×7 finder-pattern-like grid
  const cell = Math.floor((size * 0.55) / 7);
  const pattern = [
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,0,1,0,1],
    [1,0,0,0,0,0,1],
    [1,0,1,0,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1],
  ];

  return (
    <div
      aria-hidden="true"
      className="opacity-20 grid gap-px"
      style={{ gridTemplateColumns: `repeat(7, ${cell}px)` }}
    >
      {pattern.flat().map((filled, i) => (
        <div
          key={i}
          style={{ width: cell, height: cell }}
          className={filled ? "bg-ink rounded-sm" : "bg-transparent"}
        />
      ))}
    </div>
  );
}
