import { useEffect, useState } from "react";
import { useDataProvider } from "react-admin";

export function Dashboard() {
  const dataProvider = useDataProvider();
  const [stats, setStats] = useState<{ devices: number; users: number } | null>(null);

  useEffect(() => {
    Promise.all([
      dataProvider.getList("devices", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
      dataProvider.getList("users", {
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
        filter: {},
      }),
    ]).then(([deviceResult, userResult]) => {
      setStats({
        devices: deviceResult.total ?? 0,
        users: userResult.total ?? 0,
      });
    });
  }, [dataProvider]);

  return (
    <div style={{ padding: "1rem" }}>
      <h1>Admin Dashboard</h1>
      {stats ? (
        <div style={{ display: "flex", gap: "2rem", marginTop: "1rem" }}>
          <div
            style={{
              padding: "1.5rem",
              background: "#f5f5f5",
              borderRadius: "8px",
              minWidth: "150px",
            }}
          >
            <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.devices}</div>
            <div style={{ color: "#666" }}>Devices</div>
          </div>
          <div
            style={{
              padding: "1.5rem",
              background: "#f5f5f5",
              borderRadius: "8px",
              minWidth: "150px",
            }}
          >
            <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.users}</div>
            <div style={{ color: "#666" }}>Users</div>
          </div>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
