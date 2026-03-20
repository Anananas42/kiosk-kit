export type User = { id: string; name: string; email: string };

export type Device = {
  id: string;
  userId: string;
  name: string;
  tailscaleIp: string;
  createdAt: string;
};

export async function fetchMe(): Promise<User | null> {
  const res = await fetch("/api/me");
  if (!res.ok) return null;
  const data = await res.json();
  return data.user ?? null;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch("/api/devices");
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

export async function createDevice(name: string, tailscaleIp: string): Promise<Device> {
  const res = await fetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, tailscale_ip: tailscaleIp }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Failed to create device");
  }
  return res.json();
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete device");
}

export async function fetchDeviceStatus(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/devices/${id}/status`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.online ?? false;
  } catch {
    return false;
  }
}

export function logout(): Promise<Response> {
  return fetch("/api/auth/logout", { method: "POST" });
}
