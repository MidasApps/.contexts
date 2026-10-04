import { useMemo } from "react";
import { encode } from "uqr";
import { cn } from "#/shared/lib/cn.ts";

/** Scanners need a light margin of four modules around the code (ISO/IEC 18004). */
const QUIET_ZONE = 4;

/** One SVG path with a unit square per dark module: a single node instead of hundreds. */
const qrPath = (value: string): { size: number; d: string } => {
  // Level M survives a smudged or partly reflective screen at a size phones still read.
  const { size, data } = encode(value, { ecc: "M", border: QUIET_ZONE });
  const squares = data.flatMap((row, y) =>
    row.flatMap((dark, x) => (dark ? [`M${String(x)} ${String(y)}h1v1h-1z`] : [])),
  );
  return { size, d: squares.join("") };
};

export type QrCodeProps = {
  /** Text to encode (e.g. an `otpauth://` URI); it never leaves the browser. */
  value: string;
  /** Accessible name of the image (what it is for, not its content). */
  label: string;
  className?: string;
};

/**
 * A QR code drawn as inline SVG on the client. It always renders dark on light (`data-theme="light"`
 * scopes the light tokens to it), because many authenticator apps cannot read an inverted code.
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const { size, d } = useMemo(() => qrPath(value), [value]);
  return (
    <div data-theme="light" className={cn("inline-block rounded-md border border-border bg-background", className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        shapeRendering="crispEdges"
        className="block size-44"
      >
        <path d={d} className="fill-foreground" />
      </svg>
    </div>
  );
}
