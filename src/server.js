// AI Hub Shared Memory
// Authentication Middleware V1.2
//
// Responsibilities:
// - Protect the Shared Memory API
// - Validate Bearer authentication
// - Compare secrets safely
// - Never expose the configured secret
// - Provide authentication status
//
// IMPORTANT:
// The real MEMORY_API_KEY must only exist in the server environment.
// Never commit the real key to GitHub.

import crypto from "node:crypto";

const API_KEY = process.env.MEMORY_API_KEY;

const AUTH_SCHEME = "Bearer";

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getBearerToken(req) {
  const header = req.get("authorization");

  if (!header) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return match[1].trim();
}

export function requireAuth(req, res, next) {
  if (!API_KEY) {
    console.error(
      "[AUTH] MEMORY_API_KEY is not configured."
    );

    return res.status(503).json({
      ok: false,
      error: "Memory service authentication is not configured"
    });
  }

  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "Bearer authentication required"
    });
  }

  if (!safeCompare(token, API_KEY)) {
    return res.status(401).json({
      ok: false,
      error: "Invalid authentication credentials"
    });
  }

  // Authentication succeeded.
  req.authenticated = true;

  return next();
}

export function authStatus() {
  return Object.freeze({
    configured: Boolean(API_KEY),
    scheme: AUTH_SCHEME
  });
}
