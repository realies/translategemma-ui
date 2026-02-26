import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import handler from "./dist/server/server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// --- In-memory rate limiter for POST requests (API / server functions) ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress;
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Periodically clean up stale entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// --- Host header validation ---
const VALID_HOST_RE = /^[a-zA-Z0-9._\-[\]:]+(?::\d+)?$/;

const clientDir = resolve(__dirname, "dist", "client");
const clientDirWithSep = clientDir + sep;

const httpServer = createServer(async (req, res) => {
  // Apply security headers to every response
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }

  try {
    // Health check endpoint (before host validation for load-balancer probes)
    if (req.url === "/health" || req.url === "/health/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    // Validate Host header to prevent host-header injection
    const hostHeader = req.headers.host || `localhost:${port}`;
    if (!VALID_HOST_RE.test(hostHeader)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad Request");
      return;
    }

    const url = new URL(req.url || "/", `http://${hostHeader}`);

    // Rate limit POST requests (server functions / API calls)
    if (req.method === "POST") {
      const ip = getClientIp(req);
      if (isRateLimited(ip)) {
        res.writeHead(429, { "Content-Type": "text/plain" });
        res.end("Too Many Requests");
        return;
      }
    }

    // Serve static assets from dist/client
    if (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.svg") {
      const filePath = normalize(join(clientDir, url.pathname));

      // Prevent path traversal
      if (!filePath.startsWith(clientDirWithSep) && filePath !== clientDir) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }

      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        res.end(content);
        return;
      } catch (err) {
        if (err.code === "ENOENT") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        } else {
          throw err;
        }
        return;
      }
    }

    // Handle SSR for all other routes
    const request = new NodeRequest({ req, res });
    const response = await handler(request);
    await sendNodeResponse(res, response);
  } catch (error) {
    console.error("Request error:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

httpServer.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
