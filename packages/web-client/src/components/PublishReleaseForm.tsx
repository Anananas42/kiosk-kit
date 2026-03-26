import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@kioskkit/ui";
import { useId, useState } from "react";
import { publishRelease } from "../api.js";

export function PublishReleaseForm() {
  const id = useId();
  const [version, setVersion] = useState("");
  const [githubAssetUrl, setGithubAssetUrl] = useState("");
  const [sha256, setSha256] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const release = await publishRelease({
        version,
        githubAssetUrl,
        sha256,
        releaseNotes: releaseNotes || undefined,
      });
      setResult({ ok: true, message: `Published v${release.version}` });
      setVersion("");
      setGithubAssetUrl("");
      setSha256("");
      setReleaseNotes("");
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Failed to publish release",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Publish Release</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-version`}>Version</Label>
            <Input
              id={`${id}-version`}
              placeholder="1.3.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-url`}>GitHub Asset URL</Label>
            <Input
              id={`${id}-url`}
              type="url"
              placeholder="https://github.com/…/releases/download/…"
              value={githubAssetUrl}
              onChange={(e) => setGithubAssetUrl(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-sha256`}>SHA256</Label>
            <Input
              id={`${id}-sha256`}
              placeholder="e3b0c44298fc1c149afbf4c8996fb924…"
              value={sha256}
              onChange={(e) => setSha256(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-notes`}>Release Notes (optional)</Label>
            <textarea
              id={`${id}-notes`}
              className="border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              placeholder="What changed in this release…"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
            />
          </div>
          {result && (
            <p className={`text-sm ${result.ok ? "text-foreground" : "text-destructive"}`}>
              {result.message}
            </p>
          )}
          <Button type="submit" size="sm" disabled={loading}>
            {loading ? "Publishing…" : "Publish"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
