import { connect } from "node:net";
import { TRPCError } from "@trpc/server";

const SOCKET_PATH = "/run/kioskkit/privileged.sock";

interface PrivilegedResponse {
  ok: boolean;
  stdout?: string;
  error?: string;
}

/**
 * Send a command to the privileged helper daemon over its unix socket.
 * Returns stdout on success, throws a TRPCError on failure.
 */
export function runPrivileged(action: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = connect(SOCKET_PATH);
    client.setTimeout(30_000);
    const chunks: Buffer[] = [];
    let settled = false;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      fn();
    }

    client.on("timeout", () => {
      settle(() =>
        reject(
          new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Privileged helper timed out" }),
        ),
      );
      client.destroy();
    });

    client.on("connect", () => {
      client.end(`${JSON.stringify({ action, args })}\n`);
    });

    client.on("data", (chunk) => chunks.push(chunk));

    client.on("end", () => {
      settle(() => {
        try {
          const res: PrivilegedResponse = JSON.parse(Buffer.concat(chunks).toString());
          if (res.ok) {
            resolve(res.stdout ?? "");
          } else {
            reject(
              new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: res.error ?? "Script failed",
              }),
            );
          }
        } catch {
          reject(
            new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Invalid response from privileged helper",
            }),
          );
        }
      });
    });

    client.on("error", (err) => {
      settle(() =>
        reject(
          new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Privileged helper unavailable: ${err.message}`,
          }),
        ),
      );
    });
  });
}
