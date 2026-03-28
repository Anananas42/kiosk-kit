import { type FieldProps, useRecordContext } from "react-admin";

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "Unknown";

  const now = Date.now();
  const then = new Date(dateString).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 0) return "Just now";
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function RelativeTimeField({ source }: FieldProps & { source: string }) {
  const record = useRecordContext();
  const value = record?.[source] as string | null | undefined;
  return (
    <span title={value ? new Date(value).toLocaleString() : ""}>{formatRelativeTime(value)}</span>
  );
}
