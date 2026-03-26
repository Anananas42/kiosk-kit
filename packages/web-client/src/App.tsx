import { Button } from "@kioskkit/ui";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { logout } from "./api.js";
import { DeviceDetail } from "./DeviceDetail.js";
import { DeviceList } from "./DeviceList.js";
import { ReleasesAdmin } from "./ReleasesAdmin.js";
import { useAuth } from "./useAuth.js";

export function App() {
  const { user, setUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
        <h1 className="text-3xl font-bold tracking-tight">KioskKit</h1>
        <Button variant="outline" asChild>
          <a href="/api/auth/google">Sign in with Google</a>
        </Button>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex h-full flex-col items-center p-4">
        <header className="flex w-full max-w-4xl items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">KioskKit</h1>
            {user.role === "admin" && (
              <Link
                to="/releases"
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Releases
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user.name} ({user.email})
            </span>
            <Button variant="outline" size="sm" onClick={() => logout().then(() => setUser(null))}>
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex w-full max-w-4xl flex-1 flex-col py-6">
          <Routes>
            <Route path="/" element={<DeviceList />} />
            <Route path="/devices/:id" element={<DeviceDetail />} />
            <Route path="/releases" element={<ReleasesAdmin />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
