function signalBars(dBm: number): number {
  if (dBm > -50) return 4;
  if (dBm > -60) return 3;
  if (dBm > -70) return 2;
  return 1;
}

export function SignalIcon({ dBm }: { dBm: number }) {
  const bars = signalBars(dBm);
  return (
    <span className="signal-icon" title={`${dBm} dBm`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`signal-bar${i <= bars ? " active" : ""}`} />
      ))}
    </span>
  );
}
