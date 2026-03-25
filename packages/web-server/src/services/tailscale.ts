const BASE_URL = "https://api.tailscale.com";
const KIOSKKIT_TAG = "tag:kioskkit";

// ── Tailscale API response types ────────────────────────────────────

export interface TailscaleDevice {
  nodeId: string;
  name: string;
  addresses: string[];
  tags?: string[];
  online: boolean;
  lastSeen: string;
  hostname: string;
}

interface TailscaleDevicesResponse {
  devices: TailscaleDevice[];
}

export interface TailscaleAuthKey {
  id: string;
  key: string;
  created: string;
  expires: string;
}

interface CreateAuthKeyRequest {
  capabilities: {
    devices: {
      create: {
        reusable: boolean;
        ephemeral: boolean;
        preauthorized: boolean;
        tags: string[];
      };
    };
  };
  expirySeconds?: number;
}

// ── Client ──────────────────────────────────────────────────────────

export class TailscaleClient {
  private apiKey: string;
  private tailnet: string;

  constructor(apiKey: string, tailnet: string) {
    this.apiKey = apiKey;
    this.tailnet = tailnet;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Tailscale API ${res.status}: ${res.statusText} - ${body}`);
    }

    return res.json() as Promise<T>;
  }

  /** List all devices in the tailnet tagged with tag:kioskkit */
  async listDevices(): Promise<TailscaleDevice[]> {
    const data = await this.request<TailscaleDevicesResponse>(
      `/api/v2/tailnet/${this.tailnet}/devices`,
    );
    return data.devices.filter((d) => d.tags?.includes(KIOSKKIT_TAG));
  }

  /** Get a single device by its node ID */
  async getDevice(nodeId: string): Promise<TailscaleDevice> {
    return this.request<TailscaleDevice>(`/api/v2/device/${nodeId}`);
  }

  /** Create a single-use auth key tagged with tag:kioskkit (+ additional tags) */
  async createAuthKey(
    tags: string[] = [],
    opts?: { expirySeconds?: number },
  ): Promise<TailscaleAuthKey> {
    const body: CreateAuthKeyRequest = {
      capabilities: {
        devices: {
          create: {
            reusable: false,
            ephemeral: false,
            preauthorized: true,
            tags: [KIOSKKIT_TAG, ...tags],
          },
        },
      },
      expirySeconds: opts?.expirySeconds,
    };

    return this.request<TailscaleAuthKey>(`/api/v2/tailnet/${this.tailnet}/keys`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let instance: TailscaleClient | null = null;

export function getTailscaleClient(): TailscaleClient {
  if (!instance) {
    const apiKey = process.env.TAILSCALE_API_KEY;
    const tailnet = process.env.TAILSCALE_TAILNET;
    if (!apiKey || !tailnet) {
      throw new Error("TAILSCALE_API_KEY and TAILSCALE_TAILNET env vars are required");
    }
    instance = new TailscaleClient(apiKey, tailnet);
  }
  return instance;
}
