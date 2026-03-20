import { useEffect, useState } from "react";

type User = { id: string; name: string; email: string };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

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
    <div style={styles.container}>
      <h1>KioskKit</h1>
      <p>
        Signed in as <strong>{user.name}</strong> ({user.email})
      </p>
      <button
        style={styles.button}
        onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => setUser(null))}
      >
        Sign out
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontFamily: "system-ui, sans-serif",
    gap: "1rem",
  },
  button: {
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    borderRadius: "0.5rem",
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    textDecoration: "none",
    color: "#333",
  },
} as const;
