const BASE_URL = "https://api.tailscale.com";
const KIOSKKIT_TAG = "tag:kioskkit";
const SERVER_TAG = "tag:server";

// ── Tailscale API response types ────────────────────────────────────

interface RawTailscaleDevice {
  nodeId: string;
  name: string;
  addresses: string[];
  tags?: string[];
  connectedToControl: boolean;
  lastSeen: string;
  hostname: string;
}

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
  devices: RawTailscaleDevice[];
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

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

function mapDevice(raw: RawTailscaleDevice): TailscaleDevice {
  const { connectedToControl, ...rest } = raw;
  return { ...rest, online: connectedToControl };
}

// ── Client ──────────────────────────────────────────────────────────

export class TailscaleClient {
  private clientId: string;
  private clientSecret: string;
  private tailnet: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(clientId: string, clientSecret: string, tailnet: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tailnet = tailnet;
  }

  private async getAccessToken(): Promise<string> {
    // Refresh 5 minutes before expiry
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 5 * 60 * 1000) {
      return this.accessToken;
    }

    const res = await fetch(`${BASE_URL}/api/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Tailscale OAuth token exchange failed ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OAuthTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
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
    return data.devices
      .filter((d) => d.tags?.includes(KIOSKKIT_TAG) && !d.tags?.includes(SERVER_TAG))
      .map(mapDevice);
  }

  /** Get a single device by its node ID */
  async getDevice(nodeId: string): Promise<TailscaleDevice> {
    const raw = await this.request<RawTailscaleDevice>(`/api/v2/device/${nodeId}`);
    return mapDevice(raw);
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
    const clientId = process.env.TAILSCALE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.TAILSCALE_OAUTH_CLIENT_SECRET;
    const tailnet = process.env.TAILSCALE_TAILNET;
    if (!clientId || !clientSecret || !tailnet) {
      throw new Error(
        "TAILSCALE_OAUTH_CLIENT_ID, TAILSCALE_OAUTH_CLIENT_SECRET, and TAILSCALE_TAILNET env vars are required",
      );
    }
    instance = new TailscaleClient(clientId, clientSecret, tailnet);
  }
  return instance;
}
