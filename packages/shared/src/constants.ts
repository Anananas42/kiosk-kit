export const TZ: string =
  (typeof globalThis !== 'undefined' && 'process' in globalThis
    ? (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.KIOSK_TZ
    : undefined) ?? 'Europe/Prague';
