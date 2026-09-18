// AI Hub Shared Memory
// API Server V1.4
//
// Purpose:
// - Central HTTP API for AI Hub Shared Memory
// - Connect Huda, Gock, Challenger, ChatGPT and Trader
// - Provide memory CRUD, search, statistics and history
// - Protect all /api endpoints with Bearer authentication
// - Keep storage, authentication and HTTP concerns separated
//
// Security:
// - / is public
// - /health is public
// - /api/* requires MEMORY_API_KEY
// - x-ai-client identifies the AI client
// - x-ai-client is NOT authentication
// - Never store MEMORY_API_KEY in GitHub
// - Never return secrets in API responses

import express from "express";
import cors from "cors";
import crypto from "node:crypto";

import { requireAuth } from "./auth.js";

import {
  addMemory,
  getMemory,
  getAllMemories,
  updateMemory,
  archiveMemory,
  markMemoryConflict,
  requestMemoryApproval,
  searchMemories,
  getMemoryHistory,
  getMemoryStats,
  initializeMemoryStore,
  checkMemoryStore
} from "./memory-store.js";

/* =======================================================
   Configuration
======================================================= */

const app = express();

const PORT = Number(
  process.env.PORT || 3000
);

const HOST =
  process.env.HOST || "0.0.0.0";

const SERVICE_NAME =
  "AI Hub Shared Memory";

const API_VERSION =
  "1.4.0";

const MAX_BODY_SIZE =
  "1mb";

/* =======================================================
   CORS configuration
======================================================= */

const allowedOrigins =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
    : null;

/* =======================================================
   Express security
======================================================= */

app.disable("x-powered-by");

/*
 * If the application is behind a proxy such as Render,
 * this allows Express to correctly understand forwarded
 * request information.
 */
app.set("trust proxy", 1);

/* =======================================================
   CORS
======================================================= */

app.use(
  cors({
    origin(origin, callback) {
      /*
       * Requests without an Origin header include:
       * - server-to-server requests
       * - curl
       * - command-line tools
       * - some mobile clients
       */
      if (!origin) {
        return callback(null, true);
      }

      /*
       * If ALLOWED_ORIGINS is not configured,
       * development mode allows browser origins.
       */
      if (!allowedOrigins) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(
          "CORS origin not allowed."
        )
      );
    }
  })
);

/* =======================================================
   Request body parser
======================================================= */

app.use(
  express.json({
    limit: MAX_BODY_SIZE,
    strict: true
  })
);

/* =======================================================
   Request ID
======================================================= */

app.use(
  (req, res, next) => {
    const suppliedRequestId =
      req.header("x-request-id");

    const requestId =
      suppliedRequestId &&
      suppliedRequestId.length <= 128
        ? suppliedRequestId
        : crypto.randomUUID();

    req.requestId =
      requestId;

    res.setHeader(
      "x-request-id",
      requestId
    );

    next();
  }
);

/* =======================================================
   Security response headers
======================================================= */

app.use(
  (req, res, next) => {
    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.setHeader(
      "X-Frame-Options",
      "DENY"
    );

    res.setHeader(
      "Referrer-Policy",
      "no-referrer"
    );

    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );

    next();
  }
);

/* =======================================================
   Request logging
======================================================= */

app.use(
  (req, res, next) => {
    const started =
      Date.now();

    res.on(
      "finish",
      () => {
        const duration =
          Date.now() - started;

        console.log(
          `[${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );
      }
    );

    next();
  }
);

/* =======================================================
   Response helpers
======================================================= */

function success(
  res,
  data = {},
  status = 200
) {
  return res
    .status(status)
    .json({
      ok: true,
      ...data
    });
}

function failure(
  res,
  status,
  message,
  code = "REQUEST_ERROR"
) {
  return res
    .status(status)
    .json({
      ok: false,
      error: {
        code,
        message,
        request_id:
          res.getHeader(
            "x-request-id"
          )
      }
    });
}

/* =======================================================
   Request helpers
======================================================= */

function getClient(req) {
  const client =
    req.header(
      "x-ai-client"
    );

  if (!client) {
    return "unknown";
  }

  /*
   * Keep audit metadata reasonably small.
   */
  return client
    .slice(0, 100);
}

function requireObjectBody(req) {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    throw new Error(
      "Request body must be a JSON object."
    );
  }

  return req.body;
}

/* =======================================================
   Public root
======================================================= */

app.get(
  "/",
  (req, res) => {
    return success(
      res,
      {
        service:
          SERVICE_NAME,

        version:
          API_VERSION,

        status:
          "online",

        endpoints: {
          root: "/",
          health: "/health",
          api: "/api"
        }
      }
    );
  }
);

/* =======================================================
   Public health check
======================================================= */

app.get(
  "/health",
  async (req, res, next) => {
    try {
      const storage =
        await checkMemoryStore();

      return success(
        res,
        {
          service:
            SERVICE_NAME,

          version:
            API_VERSION,

          status:
            "healthy",

          storage
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   API authentication
======================================================= */

/*
 * Everything under /api is protected.
 *
 * Required header:
 *
 * Authorization: Bearer YOUR_MEMORY_API_KEY
 *
 * The real key exists only in the server environment.
 */

app.use(
  "/api",
  requireAuth
);

/* =======================================================
   API statistics
======================================================= */

app.get(
  "/api/stats",
  async (req, res, next) => {
    try {
      const stats =
        await getMemoryStats();

      return success(
        res,
        {
          stats
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Get all memories
======================================================= */

app.get(
  "/api/memories",
  async (req, res, next) => {
    try {
      const memories =
        await getAllMemories({
          includeArchived:
            req.query.includeArchived ===
            "true",

          limit:
            req.query.limit
        });

      return success(
        res,
        {
          count:
            memories.length,

          memories
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Get one memory
======================================================= */

app.get(
  "/api/memories/:id",
  async (req, res, next) => {
    try {
      const memory =
        await getMemory(
          req.params.id
        );

      if (!memory) {
        return failure(
          res,
          404,
          "Memory not found.",
          "MEMORY_NOT_FOUND"
        );
      }

      return success(
        res,
        {
          memory
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Create memory
======================================================= */

app.post(
  "/api/memories",
  async (req, res, next) => {
    try {
      const body =
        requireObjectBody(req);

      const actor =
        getClient(req);

      const memory =
        await addMemory(
          body,
          actor
        );

      return success(
        res,
        {
          memory
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Update memory
======================================================= */

app.patch(
  "/api/memories/:id",
  async (req, res, next) => {
    try {
      const body =
        requireObjectBody(req);

      const {
        reason = null,
        ...changes
      } = body;

      const memory =
        await updateMemory(
          req.params.id,
          changes,
          getClient(req),
          reason
        );

      return success(
        res,
        {
          memory
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Archive memory
======================================================= */

app.post(
  "/api/memories/:id/archive",
  async (req, res, next) => {
    try {
      const body =
        requireObjectBody(req);

      const memory =
        await archiveMemory(
          req.params.id,
          getClient(req),
          body.reason || null
        );

      return success(
        res,
        {
          memory
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Mark memory conflict
======================================================= */

app.post(
  "/api/memories/:id/conflict",
  async (req, res, next) => {
    try {
      const body =
        requireObjectBody(req);

      const memory =
        await markMemoryConflict(
          req.params.id,
          getClient(req),
          body.reason ||
            "Memory conflict detected."
        );

      return success(
        res,
        {
          memory
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Request memory approval
======================================================= */

app.post(
  "/api/memories/:id/approval",
  async (req, res, next) => {
    try {
      const body =
        requireObjectBody(req);

      const memory =
        await requestMemoryApproval(
          req.params.id,
          getClient(req),
          body.reason ||
            "Approval required."
        );

      return success(
        res,
        {
          memory
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Search memories
======================================================= */

app.get(
  "/api/search",
  async (req, res, next) => {
    try {
      const results =
        await searchMemories({
          query:
            req.query.q || "",

          category:
            req.query.category ||
            null,

          source_ai:
            req.query.source_ai ||
            null,

          related_project:
            req.query.related_project ||
            null,

          status:
            req.query.status ===
            undefined
              ? "ACTIVE"
              : req.query.status,

          limit:
            req.query.limit
        });

      return success(
        res,
        {
          count:
            results.length,

          results
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Memory history
======================================================= */

app.get(
  "/api/memories/:id/history",
  async (req, res, next) => {
    try {
      const memory =
        await getMemory(
          req.params.id
        );

      if (!memory) {
        return failure(
          res,
          404,
          "Memory not found.",
          "MEMORY_NOT_FOUND"
        );
      }

      const history =
        await getMemoryHistory(
          req.params.id,
          req.query.limit
        );

      return success(
        res,
        {
          count:
            history.length,

          history
        }
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =======================================================
   Unknown endpoint
======================================================= */

app.use(
  (req, res) => {
    return failure(
      res,
      404,
      "Endpoint not found.",
      "ENDPOINT_NOT_FOUND"
    );
  }
);

/* =======================================================
   Error handler
======================================================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      `[${req.requestId || "unknown"}]`,
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    /*
     * Invalid JSON.
     */
    if (
      error instanceof SyntaxError &&
      error.type ===
        "entity.parse.failed"
    ) {
      return failure(
        res,
        400,
        "Invalid JSON.",
        "INVALID_JSON"
      );
    }

    /*
     * Request body too large.
     */
    if (
      error.type ===
      "entity.too.large"
    ) {
      return failure(
        res,
        413,
        "Request body is too large.",
        "PAYLOAD_TOO_LARGE"
      );
    }

    /*
     * CORS rejection.
     */
    if (
      error.message ===
      "CORS origin not allowed."
    ) {
      return failure(
        res,
        403,
        "CORS origin not allowed.",
        "CORS_DENIED"
      );
    }

    const message =
      error?.message ||
      "Internal server error.";

    /*
     * Avoid returning internal stack traces
     * or implementation details to clients.
     */
    const safeMessage =
      message.length > 500
        ? "Request failed."
        : message;

    let status = 400;

    if (
      message
        .toLowerCase()
        .includes("not found")
    ) {
      status = 404;
    }

    return failure(
      res,
      status,
      safeMessage,
      "REQUEST_FAILED"
    );
  }
);

/* =======================================================
   Server lifecycle
======================================================= */

let server = null;

async function start() {
  await initializeMemoryStore();

  server =
    app.listen(
      PORT,
      HOST,
      () => {
        console.log(
          `${SERVICE_NAME} v${API_VERSION} listening on ${HOST}:${PORT}`
        );
      }
    );
}

async function shutdown(
  signal
) {
  console.log(
    `Received ${signal}. Shutting down...`
  );

  if (!server) {
    process.exit(0);
  }

  server.close(
    () => {
      console.log(
        `${SERVICE_NAME} stopped.`
      );

      process.exit(0);
    }
  );
}

/* =======================================================
   Process handlers
======================================================= */

process.on(
  "SIGTERM",
  () => {
    shutdown("SIGTERM");
  }
);

process.on(
  "SIGINT",
  () => {
    shutdown("SIGINT");
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught exception:",
      error
    );

    process.exit(1);
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled rejection:",
      error
    );

    process.exit(1);
  }
);

/* =======================================================
   Start application
======================================================= */

start().catch(
  error => {
    console.error(
      "Failed to start Shared Memory:",
      error
    );

    process.exit(1);
  }
);

export default app;
