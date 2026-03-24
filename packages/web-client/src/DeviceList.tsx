import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type Device, fetchDeviceStatus, fetchDevices } from "./api.js";

export function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  if (loading) return <p>Loading devices...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div>
      <h2>Devices</h2>

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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
