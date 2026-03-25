import { BrowserRouter, Route, Routes } from "react-router";
import { logout } from "./api.js";
import { DeviceDetail } from "./DeviceDetail.js";
import { DeviceList } from "./DeviceList.js";
import { useAuth } from "./useAuth.js";

export function App() {
  const { user, setUser, loading } = useAuth();

  if (loading) return <div style={styles.container}>Loading...</div>;

  if (!user) {
    return (
      <div style={styles.container}>
        <h1>KioskKit</h1>
        <a href="/api/auth/google" style={styles.button}>
          Sign in with Google
        </a>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={{ margin: 0 }}>KioskKit</h1>
          <span>
            {user.name} ({user.email}){" "}
            <button
              type="button"
              style={styles.button}
              onClick={() => logout().then(() => setUser(null))}
            >
              Sign out
            </button>
          </span>
        </header>
        <main
          style={{
            width: "100%",
            maxWidth: 900,
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Routes>
            <Route path="/" element={<DeviceList />} />
            <Route path="/devices/:id" element={<DeviceDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    height: "100%",
    fontFamily: "system-ui, sans-serif",
    padding: "1rem",
    gap: "1rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between" as const,
    alignItems: "center",
    width: "100%",
    maxWidth: 600,
    gap: "1rem",
  },
  button: {
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    borderRadius: "0.375rem",
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    textDecoration: "none",
    color: "#333",
  },
} as const;
