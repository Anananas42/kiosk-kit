import { Link } from "react-router";
import { PublishReleaseForm } from "./components/PublishReleaseForm.js";

export function ReleasesAdmin() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <nav className="text-muted-foreground">
          <Link to="/" className="hover:text-foreground underline-offset-4 hover:underline">
            Dashboard
          </Link>
          <span className="mx-2">/</span>
        </nav>
        <span className="text-foreground font-medium">Releases</span>
      </div>
      <PublishReleaseForm />
    </div>
  );
}
