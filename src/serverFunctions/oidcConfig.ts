import { createServerFn } from "@tanstack/react-start";

export interface OidcPublicConfig {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  redirectUri: string | null;
  scopes: string;
  postLogoutRedirectUri: string | null;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim() ?? null;
  if (value === "") return null;
  return value;
}

function readBooleanEnv(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export const getOidcConfig = createServerFn({ method: "GET" }).handler((): OidcPublicConfig => {
  const oidcEnabled = readBooleanEnv("OIDC_ENABLED");
  const issuerUrl = readEnv("OIDC_ISSUER_URL")?.replace(/\/+$/, "") ?? "";
  const clientId = readEnv("OIDC_CLIENT_ID") ?? "";

  return {
    enabled: oidcEnabled && Boolean(issuerUrl && clientId),
    issuerUrl,
    clientId,
    redirectUri: readEnv("OIDC_REDIRECT_URI"),
    scopes: readEnv("OIDC_SCOPES") ?? "openid profile email",
    postLogoutRedirectUri: readEnv("OIDC_POST_LOGOUT_REDIRECT_URI"),
  };
});
