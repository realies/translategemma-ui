import type { OidcPublicConfig } from "~/serverFunctions/oidcConfig";

export interface OidcSession {
  email: string;
  accessToken: string | null;
  idToken: string | null;
  expiresAt: number;
}

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
}

const OIDC_SESSION_KEY = "oidc.session";
const OIDC_PKCE_VERIFIER_KEY = "oidc.pkce.verifier";
const OIDC_STATE_KEY = "oidc.auth.state";

const discoveryCache = new Map<string, Promise<OidcDiscoveryDocument>>();

function base64UrlEncode(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function randomString(length = 64): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let output = "";
  for (const value of values) {
    output += alphabet[value % alphabet.length] ?? "A";
  }
  return output;
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(digest);
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${normalizedPath}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function resolveRedirectUri(config: OidcPublicConfig): string {
  if (config.redirectUri) return normalizeUrl(config.redirectUri);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${normalizedPath}`;
}

function resolvePostLogoutRedirectUri(config: OidcPublicConfig): string | null {
  if (!config.postLogoutRedirectUri) return null;
  return normalizeUrl(config.postLogoutRedirectUri);
}

async function getDiscovery(issuerUrl: string): Promise<OidcDiscoveryDocument> {
  const normalizedIssuer = issuerUrl.replace(/\/+$/, "");

  const cached = discoveryCache.get(normalizedIssuer);
  if (cached) return cached;

  const request = (async () => {
    const response = await fetch(`${normalizedIssuer}/.well-known/openid-configuration`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OIDC discovery failed: ${String(response.status)} - ${errorText}`);
    }

    const json = (await response.json()) as Partial<OidcDiscoveryDocument>;
    if (!json.authorization_endpoint || !json.token_endpoint) {
      throw new Error("OIDC discovery missing required endpoints");
    }

    const discovery: OidcDiscoveryDocument = {
      authorization_endpoint: json.authorization_endpoint,
      token_endpoint: json.token_endpoint,
    };

    if (typeof json.end_session_endpoint === "string") {
      discovery.end_session_endpoint = json.end_session_endpoint;
    }

    return discovery;
  })();

  discoveryCache.set(normalizedIssuer, request);
  return request;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (!payloadPart) return null;

  try {
    return JSON.parse(decodeBase64Url(payloadPart)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractEmail(payload: Record<string, unknown> | null): string {
  const email = payload?.["email"];
  if (typeof email === "string" && email) return email;

  const preferredUsername = payload?.["preferred_username"];
  if (typeof preferredUsername === "string" && preferredUsername) return preferredUsername;

  const subject = payload?.["sub"];
  if (typeof subject === "string" && subject) return subject;

  return "authenticated-user";
}

function cleanupCallbackQueryParams(): void {
  const url = new URL(window.location.href);
  for (const key of ["code", "state", "session_state", "iss", "error", "error_description"]) {
    url.searchParams.delete(key);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, next);
}

export function getStoredOidcSession(): OidcSession | null {
  try {
    const raw = localStorage.getItem(OIDC_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OidcSession>;

    if (typeof parsed.email !== "string") return null;
    if (typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now() + 15_000) {
      localStorage.removeItem(OIDC_SESSION_KEY);
      return null;
    }

    return {
      email: parsed.email,
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      idToken: typeof parsed.idToken === "string" ? parsed.idToken : null,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function saveOidcSession(session: OidcSession): void {
  localStorage.setItem(OIDC_SESSION_KEY, JSON.stringify(session));
}

export function clearOidcSession(): void {
  localStorage.removeItem(OIDC_SESSION_KEY);
}

export async function beginOidcLogin(config: OidcPublicConfig): Promise<void> {
  const discovery = await getDiscovery(config.issuerUrl);

  const verifier = randomString(96);
  const challenge = await createCodeChallenge(verifier);
  const state = randomString(48);
  const nonce = randomString(48);

  sessionStorage.setItem(OIDC_PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OIDC_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: resolveRedirectUri(config),
    scope: config.scopes,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.assign(`${discovery.authorization_endpoint}?${params.toString()}`);
}

export async function completeOidcCallback(config: OidcPublicConfig): Promise<OidcSession | null> {
  const url = new URL(window.location.href);

  const callbackError = url.searchParams.get("error");
  if (callbackError) {
    const message = url.searchParams.get("error_description") ?? callbackError;
    cleanupCallbackQueryParams();
    throw new Error(`OIDC login failed: ${message}`);
  }

  const code = url.searchParams.get("code");
  if (!code) return null;

  const returnedState = url.searchParams.get("state");
  const expectedState = sessionStorage.getItem(OIDC_STATE_KEY);
  const verifier = sessionStorage.getItem(OIDC_PKCE_VERIFIER_KEY);

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    cleanupCallbackQueryParams();
    throw new Error("OIDC login failed: state mismatch");
  }

  if (!verifier) {
    cleanupCallbackQueryParams();
    throw new Error("OIDC login failed: missing PKCE verifier");
  }

  const discovery = await getDiscovery(config.issuerUrl);
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: resolveRedirectUri(config),
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    cleanupCallbackQueryParams();
    throw new Error(`OIDC token exchange failed: ${String(tokenResponse.status)} - ${errorText}`);
  }

  const payload = (await tokenResponse.json()) as TokenResponse;
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  const expiresAt = Date.now() + expiresIn * 1000;
  const idToken = typeof payload.id_token === "string" ? payload.id_token : null;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;

  const session: OidcSession = {
    email: extractEmail(idToken ? parseJwtPayload(idToken) : null),
    accessToken,
    idToken,
    expiresAt,
  };

  saveOidcSession(session);

  sessionStorage.removeItem(OIDC_PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OIDC_STATE_KEY);
  cleanupCallbackQueryParams();

  return session;
}

export async function beginOidcLogout(
  config: OidcPublicConfig,
  session: OidcSession | null
): Promise<void> {
  clearOidcSession();

  const discovery = await getDiscovery(config.issuerUrl);
  const endSessionEndpoint = discovery.end_session_endpoint;
  const redirectUri = resolveRedirectUri(config);
  const postLogoutRedirectUri = resolvePostLogoutRedirectUri(config);

  if (!endSessionEndpoint) {
    window.location.assign(redirectUri);
    return;
  }

  const params = new URLSearchParams({ client_id: config.clientId });
  if (postLogoutRedirectUri) {
    params.set("post_logout_redirect_uri", postLogoutRedirectUri);
  }
  if (session?.idToken) {
    params.set("id_token_hint", session.idToken);
  }

  window.location.assign(`${endSessionEndpoint}?${params.toString()}`);
}
