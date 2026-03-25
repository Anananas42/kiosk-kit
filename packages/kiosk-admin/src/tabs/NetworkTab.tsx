import { type FormEvent, useCallback, useState } from "react";
import { useData, useFormStatus } from "../hooks.js";
import { trpc } from "../trpc.js";

function signalBars(dBm: number): number {
  if (dBm > -50) return 4;
  if (dBm > -60) return 3;
  if (dBm > -70) return 2;
  return 1;
}

function SignalIcon({ dBm }: { dBm: number }) {
  const bars = signalBars(dBm);
  return (
    <span className="signal-icon" title={`${dBm} dBm`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`signal-bar${i <= bars ? " active" : ""}`} />
      ))}
    </span>
  );
}

type ExpandedNetwork = { ssid: string; type: "saved" | "available" } | null;

export function NetworkTab() {
  const fetcher = useCallback(() => trpc["admin.network.list"].query(), []);
  const { data: status, error, loading, reload } = useData(fetcher);
  const form = useFormStatus();

  const [expanded, setExpanded] = useState<ExpandedNetwork>(null);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenSsid, setHiddenSsid] = useState("");
  const [hiddenPassword, setHiddenPassword] = useState("");
  const [showForgetWarning, setShowForgetWarning] = useState<string | null>(null);

  const toggleExpand = (ssid: string, type: "saved" | "available") => {
    if (expanded?.ssid === ssid && expanded.type === type) {
      setExpanded(null);
    } else {
      setExpanded({ ssid, type });
      setPassword("");
    }
    form.clear();
  };

  const handleConnect = (e: FormEvent, ssid: string, pwd?: string) => {
    e.preventDefault();
    setConnecting(true);
    form.clear();
    trpc["admin.network.connect"]
      .mutate({ ssid, password: pwd || undefined })
      .then(() => {
        setExpanded(null);
        setPassword("");
        reload();
      })
      .catch(() => form.setError("Could not connect — check password and try again"))
      .finally(() => setConnecting(false));
  };

  const handleForget = (ssid: string) => {
    if (!status) return;

    // Safety check: forgetting the current connection with no fallback
    if (
      status.current?.ssid === ssid &&
      !status.ethernet &&
      !status.saved.some((s) => s.ssid !== ssid && s.inRange)
    ) {
      setShowForgetWarning(ssid);
      return;
    }

    doForget(ssid);
  };

  const doForget = (ssid: string) => {
    setForgetting(ssid);
    form.clear();
    setShowForgetWarning(null);
    trpc["admin.network.forget"]
      .mutate({ ssid })
      .then(() => reload())
      .catch((err: Error) => form.setError(err.message))
      .finally(() => setForgetting(null));
  };

  const handleHiddenConnect = (e: FormEvent) => {
    e.preventDefault();
    if (!hiddenSsid.trim()) return;
    setConnecting(true);
    form.clear();
    trpc["admin.network.connect"]
      .mutate({ ssid: hiddenSsid.trim(), password: hiddenPassword || undefined })
      .then(() => {
        setShowHidden(false);
        setHiddenSsid("");
        setHiddenPassword("");
        reload();
      })
      .catch(() => form.setError("Could not connect — check password and try again"))
      .finally(() => setConnecting(false));
  };

  if (loading) return <p className="msg-loading">Loading...</p>;
  if (error) return <p className="msg-error">Error: {error}</p>;
  if (!status) return null;

  const savedNotConnected = status.saved.filter((s) => s.ssid !== status.current?.ssid);
  const savedSsids = new Set(status.saved.map((s) => s.ssid));
  const availableUnsaved = status.available
    .filter((n) => n.ssid !== status.current?.ssid && !savedSsids.has(n.ssid))
    .sort((a, b) => b.signal - a.signal);

  return (
    <div>
      <div className="network-header">
        <h2 className="section-heading" style={{ margin: 0 }}>
          Network
        </h2>
        <button type="button" className="btn btn-sm" onClick={reload}>
          Scan
        </button>
      </div>

      {form.error && <p className="msg-error">{form.error}</p>}

      {status.ethernet && <p className="network-ethernet-badge">Ethernet connected</p>}

      {/* ── Connected ──────────────────────────────────────────────── */}
      {status.current && (
        <>
          <h3 className="section-heading">Connected</h3>
          <div className="network-row">
            <div className="network-row-info">
              <SignalIcon dBm={status.current.signal} />
              <span className="network-ssid">{status.current.ssid}</span>
              <span className="badge" style={{ background: "var(--color-success)" }}>
                Connected
              </span>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={forgetting === status.current.ssid}
              onClick={() => handleForget(status.current!.ssid)}
            >
              {forgetting === status.current.ssid ? "Forgetting..." : "Forget"}
            </button>
          </div>
        </>
      )}

      {/* ── Saved ──────────────────────────────────────────────────── */}
      {savedNotConnected.length > 0 && (
        <>
          <h3 className="section-heading">Saved Networks</h3>
          {savedNotConnected.map((net) => (
            <div key={net.ssid}>
              <div className="network-row">
                <button
                  type="button"
                  className="network-row-clickable network-row-info"
                  onClick={() => toggleExpand(net.ssid, "saved")}
                >
                  {net.inRange && net.signal != null ? (
                    <SignalIcon dBm={net.signal} />
                  ) : (
                    <span className="network-out-of-range">Out of range</span>
                  )}
                  <span className="network-ssid">{net.ssid}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={forgetting === net.ssid}
                  onClick={() => handleForget(net.ssid)}
                >
                  {forgetting === net.ssid ? "Forgetting..." : "Forget"}
                </button>
              </div>
              {expanded?.ssid === net.ssid && expanded.type === "saved" && (
                <form
                  className="network-expand"
                  onSubmit={(e) => handleConnect(e, net.ssid, password)}
                >
                  <div className="form-row">
                    <input
                      type="password"
                      placeholder="New password (optional)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={connecting}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={connecting}>
                      {connecting ? "Connecting..." : "Reconnect"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Available ──────────────────────────────────────────────── */}
      {availableUnsaved.length > 0 && (
        <>
          <h3 className="section-heading">Available Networks</h3>
          {availableUnsaved.map((net) => (
            <div key={net.ssid}>
              <button
                type="button"
                className="network-row network-row-clickable"
                onClick={() => toggleExpand(net.ssid, "available")}
              >
                <div className="network-row-info">
                  <SignalIcon dBm={net.signal} />
                  <span className="network-ssid">{net.ssid}</span>
                  {net.security === "wpa" && <span className="network-lock">WPA</span>}
                </div>
              </button>
              {expanded?.ssid === net.ssid && expanded.type === "available" && (
                <form
                  className="network-expand"
                  onSubmit={(e) =>
                    handleConnect(e, net.ssid, net.security === "wpa" ? password : undefined)
                  }
                >
                  <div className="form-row">
                    {net.security === "wpa" && (
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={connecting}
                      />
                    )}
                    <button type="submit" className="btn btn-primary btn-sm" disabled={connecting}>
                      {connecting ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </>
      )}

      {!status.current && savedNotConnected.length === 0 && availableUnsaved.length === 0 && (
        <p className="empty-state">No networks found. Click Scan to search.</p>
      )}

      {/* ── Hidden network ─────────────────────────────────────────── */}
      <div className="network-hidden-section">
        {!showHidden ? (
          <button type="button" className="btn btn-sm" onClick={() => setShowHidden(true)}>
            Connect to hidden network
          </button>
        ) : (
          <form className="network-expand" onSubmit={handleHiddenConnect}>
            <h3 className="section-heading">Hidden Network</h3>
            <div className="form-row">
              <input
                type="text"
                placeholder="Network name (SSID)"
                value={hiddenSsid}
                onChange={(e) => setHiddenSsid(e.target.value)}
                disabled={connecting}
              />
              <input
                type="password"
                placeholder="Password (optional)"
                value={hiddenPassword}
                onChange={(e) => setHiddenPassword(e.target.value)}
                disabled={connecting}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={connecting || !hiddenSsid.trim()}
              >
                {connecting ? "Connecting..." : "Connect"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setShowHidden(false);
                  setHiddenSsid("");
                  setHiddenPassword("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Forget warning dialog ──────────────────────────────────── */}
      {showForgetWarning && (
        <div className="network-warning-overlay">
          <div className="network-warning-dialog">
            <p>
              <strong>This is your only connection.</strong> The device will go offline. Plug in
              Ethernet before removing this network.
            </p>
            <div className="form-row">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => doForget(showForgetWarning)}
              >
                Forget anyway
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowForgetWarning(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
