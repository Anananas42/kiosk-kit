export default function OfflineBanner({ isOffline }: { isOffline: boolean }) {
  if (!isOffline) return null;

  return (
    <div className="offline-banner">Offline</div>
  );
}
