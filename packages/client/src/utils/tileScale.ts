/**
 * Computes a cqi-based font-size value that ensures the longest label
 * fits within the tile width on a single line.
 *
 * Bold system-ui averages ~0.6em per character.
 * SCALE controls the text-to-tile ratio — lower = smaller text.
 */
const SCALE = 100;

export function tileScaleCqi(labels: string[]): number {
  const longest = labels.reduce((max, l) => Math.max(max, l.length), 1);
  return Math.min(14, Math.max(2, SCALE / longest));
}

/** Returns a style object with --tile-font-cqi set */
export function tileScaleStyle(labels: string[]): React.CSSProperties {
  return { '--tile-font-cqi': tileScaleCqi(labels) } as React.CSSProperties;
}
