import { Button, Spinner } from "@kioskkit/ui";
import { BrowserRouter, Route, Routes } from "react-router";
import { logout } from "./api/auth.js";
import { useAuth } from "./hooks/auth.js";
import { useTranslate } from "./hooks/useTranslate.js";
import { DeviceDetail } from "./pages/DeviceDetail.js";
import { DeviceList } from "./pages/DeviceList.js";

export function App() {
  const t = useTranslate();
  const { user, setUser, loading, error } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("app.title")}</h1>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button variant="outline" asChild>
          <a href="/api/auth/google">{t("app.signInWithGoogle")}</a>
        </Button>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex h-full flex-col items-center p-4">
        <header className="flex w-full max-w-4xl items-center justify-between gap-4 border-b pb-4">
          <h1 className="text-xl font-bold tracking-tight">{t("app.title")}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user.name} ({user.email})
            </span>
            <Button variant="outline" size="sm" onClick={() => logout().then(() => setUser(null))}>
              {t("common.signOut")}
            </Button>
          </div>
        </header>
        <main className="flex w-full max-w-4xl flex-1 flex-col py-6">
          <Routes>
            <Route path="/" element={<DeviceList />} />
            <Route path="/devices/:id" element={<DeviceDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
