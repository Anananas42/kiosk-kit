import crypto from "node:crypto";
import type { Google } from "arctic";
import { generateCodeVerifier, generateState } from "arctic";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { createSession, deleteSession } from "../auth/session.js";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";

export function authRoutes(db: Db, google: Google) {
  const app = new Hono();

  app.get(
    "/google",
    describeRoute({
      tags: ["Auth"],
      summary: "Start Google OAuth flow",
      description: "Redirects to Google for authentication.",
      responses: {
        302: { description: "Redirect to Google OAuth" },
      },
    }),
    async (c) => {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();

      const url = google.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "email",
        "profile",
      ]);

      setCookie(c, "oauth_state", state, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 600,
      });
      setCookie(c, "oauth_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 600,
      });

      return c.redirect(url.toString());
    },
  );

  app.get(
    "/google/callback",
    describeRoute({
      tags: ["Auth"],
      summary: "Google OAuth callback",
      description: "Handles the OAuth callback, creates a session, and redirects to /.",
      parameters: [
        { name: "code", in: "query", required: true, schema: { type: "string" } },
        { name: "state", in: "query", required: true, schema: { type: "string" } },
      ],
      responses: {
        302: { description: "Redirect to app after login" },
        400: {
          description: "Invalid OAuth callback",
          content: {
            "application/json": { schema: resolver(z.object({ error: z.string() })) },
          },
        },
      },
    }),
    async (c) => {
      const code = c.req.query("code");
      const state = c.req.query("state");
      const storedState = getCookie(c, "oauth_state");
      const codeVerifier = getCookie(c, "oauth_code_verifier");

      if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
        return c.json({ error: "Invalid OAuth callback" }, 400);
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

      setCookie(c, "session", sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });

      // Clear OAuth cookies
      setCookie(c, "oauth_state", "", { maxAge: 0, path: "/" });
      setCookie(c, "oauth_code_verifier", "", { maxAge: 0, path: "/" });

      return c.redirect("/");
    },
  );

  app.post(
    "/logout",
    describeRoute({
      tags: ["Auth"],
      summary: "Log out",
      description: "Destroys the current session.",
      responses: {
        200: {
          description: "Logged out",
          content: {
            "application/json": { schema: resolver(z.object({ ok: z.boolean() })) },
          },
        },
      },
    }),
    async (c) => {
      const sessionId = getCookie(c, "session");
      if (sessionId) {
        await deleteSession(db, sessionId);
      }
      setCookie(c, "session", "", { maxAge: 0, path: "/" });
      return c.json({ ok: true });
    },
  );

  return app;
}
