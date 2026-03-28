import { SocksClient } from "socks";
import { Agent, buildConnector } from "undici";
import { LOCAL_DEVICE_HOST, LOCAL_DEVICE_ID } from "../local-dev.js";

const isDev = process.env.NODE_ENV === "development";
const DEVICE_PORT = 3001;

interface DeviceLike {
  id: string;
  tailscaleIp: string | null;
}

let socksAgent: Agent | undefined;

function getSocksAgent(): Agent | undefined {
  if (socksAgent) return socksAgent;

  const proxy = process.env.TAILSCALE_SOCKS_PROXY;
  if (!proxy) return undefined;

  const [host, port] = proxy.split(":");
  const defaultConnect = buildConnector({});

  socksAgent = new Agent({
    connect(opts, cb) {
      if (opts.hostname?.startsWith("100.")) {
        SocksClient.createConnection({
          proxy: { host: host!, port: Number(port), type: 5 },
          command: "connect",
          destination: { host: opts.hostname, port: Number(opts.port) },
        }).then(
          ({ socket }) => cb(null, socket),
          (err) => cb(err, null),
        );
        return;
      }
      defaultConnect(opts, cb);
    },
  });

  return socksAgent;
}

function getDeviceOrigin(device: DeviceLike): string {
  if (isDev && device.id === LOCAL_DEVICE_ID) {
    return `http://${LOCAL_DEVICE_HOST}`;
  }
  return `http://${device.tailscaleIp}:${DEVICE_PORT}`;
}

export function fetchDeviceProxy(
  device: DeviceLike,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getDeviceOrigin(device)}${path}`;
  const agent = getSocksAgent();

  if (agent) {
    return fetch(url, { ...init, dispatcher: agent } as RequestInit);
  }

  return fetch(url, init);
}
