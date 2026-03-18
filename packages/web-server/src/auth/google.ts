import { Google } from "arctic";

export function createGoogleOAuth(clientId: string, clientSecret: string, redirectUri: string) {
  return new Google(clientId, clientSecret, redirectUri);
}
