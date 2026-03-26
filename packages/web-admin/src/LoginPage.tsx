import { Box, Button, Card, CardContent, Typography } from "@mui/material";

export function LoginPage() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <Card sx={{ minWidth: 350, maxWidth: 400 }}>
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            p: 4,
          }}
        >
          <Typography variant="h4" component="h1" fontWeight="bold">
            KioskKit Admin
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to manage your devices
          </Typography>
          <Button variant="outlined" size="large" href="/api/auth/google" fullWidth>
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
