import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { createDevice, type Device, deleteDevice, fetchDeviceStatus, fetchDevices } from "./api.js";

export function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [tailscaleIp, setTailscaleIp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const loadDevices = () => {
    setLoading(true);
    fetchDevices()
      .then((d) => {
        setDevices(d);
        setError(null);
        for (const device of d) {
          fetchDeviceStatus(device.id).then((online) =>
            setStatuses((prev) => ({ ...prev, [device.id]: online })),
          );
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadDevices, []);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    createDevice(name, tailscaleIp)
      .then(() => {
        setName("");
        setTailscaleIp("");
        loadDevices();
      })
      .catch((err) => setFormError(err.message));
  };

  const handleDelete = (id: string, deviceName: string) => {
    if (!confirm(`Delete device "${deviceName}"?`)) return;
    deleteDevice(id)
      .then(loadDevices)
      .catch((err) => setError(err.message));
  };

  if (loading) return <p>Loading devices...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h2>Devices</h2>

      <form onSubmit={handleAdd} style={{ marginBottom: "1rem" }}>
        <input
          placeholder="Device name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ marginRight: "0.5rem" }}
        />
        <input
          placeholder="Tailscale IP"
          value={tailscaleIp}
          onChange={(e) => setTailscaleIp(e.target.value)}
          required
          style={{ marginRight: "0.5rem" }}
        />
        <button type="submit">Add device</button>
        {formError && <span style={{ color: "red", marginLeft: "0.5rem" }}>{formError}</span>}
      </form>

      {devices.length === 0 ? (
        <p>No devices registered.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {devices.map((d) => (
            <li
              key={d.id}
              style={{
                padding: "0.5rem",
                borderBottom: "1px solid #eee",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: statuses[d.id] ? "green" : "gray",
                }}
                title={statuses[d.id] ? "Online" : "Offline"}
              />
              <Link to={`/devices/${d.id}`} style={{ flex: 1 }}>
                {d.name}
              </Link>
              <span style={{ color: "#888" }}>{d.tailscaleIp}</span>
              <button type="button" onClick={() => handleDelete(d.id, d.name)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
