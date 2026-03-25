import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type Device, fetchDevice, fetchDeviceStatus } from "./api.js";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const [online, setOnline] = useState<boolean | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchDevice(id)
      .then(setDevice)
      .catch(() => {});
    fetchDeviceStatus(id).then(setOnline);
  }, [id]);

  if (!id) return <p>Missing device ID.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div>
        <Link to="/">&larr; Back to devices</Link>
        <h2>{device?.name ?? "Loading..."}</h2>

        {online === null ? (
          <p>Checking device status...</p>
        ) : online ? (
          <p style={{ color: "green", fontWeight: "bold" }}>Online</p>
        ) : (
          <p style={{ color: "red", fontWeight: "bold" }}>
            Device is offline. Management is unavailable.
          </p>
        )}
      </div>

      {online === false ? null : online === null ? null : (
        <div style={{ flex: 1, minHeight: 0 }}>
          {iframeLoading && <p>Loading...</p>}
          <iframe
            src={`/api/devices/${id}/kiosk/admin/`}
            title="Device Admin"
            onLoad={() => setIframeLoading(false)}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: iframeLoading ? "none" : "block",
            }}
          />
        </div>
      )}
    </div>
  );
}
