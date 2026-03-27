import { Alert, Box, Card, CardContent, Chip, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useDataProvider } from "react-admin";
import { trpc } from "./trpc.js";

export function Dashboard() {
  const dataProvider = useDataProvider();
  const [stats, setStats] = useState<{ devices: number; users: number } | null>(null);
  const [tsStatus, setTsStatus] = useState<{ reachable: boolean; error: string | null } | null>(
    null,
  );

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

    trpc["devices.tailscaleStatus"]
      .query()
      .then(setTsStatus)
      .catch(() => setTsStatus({ reachable: false, error: "Failed to check Tailscale status" }));
  }, [dataProvider]);

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Typography variant="h4" component="h1">
          Admin Dashboard
        </Typography>
        {tsStatus && (
          <Chip
            size="small"
            label={tsStatus.reachable ? "Tailscale connected" : "Tailscale unreachable"}
            color={tsStatus.reachable ? "success" : "error"}
          />
        )}
      </Box>
      {tsStatus && !tsStatus.reachable && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {tsStatus.error}
        </Alert>
      )}
      {stats ? (
        <Box sx={{ display: "flex", gap: 3, mt: 2 }}>
          <Card sx={{ minWidth: 150 }}>
            <CardContent>
              <Typography variant="h3" component="div">
                {stats.devices}
              </Typography>
              <Typography color="text.secondary">Devices</Typography>
            </CardContent>
          </Card>
          <Card sx={{ minWidth: 150 }}>
            <CardContent>
              <Typography variant="h3" component="div">
                {stats.users}
              </Typography>
              <Typography color="text.secondary">Users</Typography>
            </CardContent>
          </Card>
        </Box>
      ) : (
        <Typography>Loading...</Typography>
      )}
    </Box>
  );
}
