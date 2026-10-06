export type Rgb = { r: number; g: number; b: number };

/** Parses an opaque `#rrggbb` color; translucent tokens have no fixed contrast. */
export const parseHexColor = (hex: string): Rgb => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`Expected an opaque #rrggbb color: ${hex}`);
  const [r = 0, g = 0, b = 0] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return { r, g, b };
};

const linearChannel = (channel: number): number => {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance. */
const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);

/** WCAG 2.x contrast ratio between two opaque colors (1–21). */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
};
