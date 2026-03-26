import { Box, Card, CardContent, Typography } from "@mui/material";
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
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Admin Dashboard
      </Typography>
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
