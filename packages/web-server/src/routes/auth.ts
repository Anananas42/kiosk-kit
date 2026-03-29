import crypto from "node:crypto";
import type { Google } from "arctic";
import { generateCodeVerifier, generateState } from "arctic";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { createSession, deleteSession } from "../auth/session.js";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";

export function authRoutes(db: Db, google: Google, cookieDomain?: string) {
  const app = new Hono();

  function domainOpts(opts: CookieOptions): CookieOptions {
    if (cookieDomain) {
      return { ...opts, domain: cookieDomain };
    }
    return opts;
  }

  function isAllowedRedirectHost(host: string): boolean {
    if (!cookieDomain) return false;
    // cookieDomain is e.g. ".kioskk.net" — host must end with "kioskk.net"
    const base = cookieDomain.startsWith(".") ? cookieDomain.slice(1) : cookieDomain;
    return host === base || host.endsWith(`.${base}`);
  }

  app.get("/google", async (c) => {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    // Encode origin host into state so callback can redirect back
    const originHost = c.req.header("host") ?? "";
    const combinedState = `${state}:${originHost}`;

    const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);

    setCookie(
      c,
      "oauth_state",
      state,
      domainOpts({
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 600,
      }),
    );
    setCookie(
      c,
      "oauth_code_verifier",
      codeVerifier,
      domainOpts({
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 600,
      }),
    );

    // Pass combined state (with origin host) to Google
    const authUrl = new URL(url.toString());
    authUrl.searchParams.set("state", combinedState);

    return c.redirect(authUrl.toString());
  });

  app.get("/google/callback", async (c) => {
    const code = c.req.query("code");
    const rawState = c.req.query("state");
    const storedState = getCookie(c, "oauth_state");
    const codeVerifier = getCookie(c, "oauth_code_verifier");

    if (!code || !rawState || !storedState || !codeVerifier) {
      // OAuth cookies expired or were already cleared (e.g. user pressed
      // the browser back button after completing sign-in and picked a
      // different Google account). Restart the flow instead of erroring.
      return c.redirect("/api/auth/google");
    }

    // Split combined state into oauth state and origin host
    const colonIdx = rawState.indexOf(":");
    const state = colonIdx >= 0 ? rawState.slice(0, colonIdx) : rawState;
    const originHost = colonIdx >= 0 ? rawState.slice(colonIdx + 1) : "";

    if (state !== storedState) {
      // State mismatch — stale cookies from a previous flow. Restart.
      return c.redirect("/api/auth/google");
    }

    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken();

    // Fetch user info from Google
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const googleUser = (await response.json()) as {
      id: string;
      email: string;
      name: string;
    };

    // Upsert user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.id))
      .limit(1);

    let userId: string;
    if (existing.length > 0) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({ email: googleUser.email, name: googleUser.name })
        .where(eq(users.id, userId));
    } else {
      userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        email: googleUser.email,
        name: googleUser.name,
        googleId: googleUser.id,
      });
    }

    const sessionId = await createSession(db, userId);

    setCookie(
      c,
      "session",
      sessionId,
      domainOpts({
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      }),
    );

    // Clear OAuth cookies
    setCookie(c, "oauth_state", "", domainOpts({ maxAge: 0, path: "/" }));
    setCookie(c, "oauth_code_verifier", "", domainOpts({ maxAge: 0, path: "/" }));

    // Redirect back to origin subdomain if allowed, otherwise "/"
    if (originHost && isAllowedRedirectHost(originHost)) {
      return c.redirect(`https://${originHost}/`);
    }
    return c.redirect("/");
  });

  app.post("/logout", async (c) => {
    const sessionId = getCookie(c, "session");
    if (sessionId) {
      await deleteSession(db, sessionId);
    }
    setCookie(c, "session", "", domainOpts({ maxAge: 0, path: "/" }));
    return c.json({ ok: true });
  });

  return app;
}
