export interface ServerOperation {
  id: string;
  deviceId: string;
  type: string;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
}
