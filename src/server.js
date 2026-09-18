// AI Hub Shared Memory
// API Server V1.2
//
// Purpose:
// - HTTP API for the AI Hub Shared Memory service
// - Connect AI clients to the memory layer
// - Keep storage logic separate from HTTP logic
// - Provide health, statistics, search, CRUD, and history endpoints
//
// Security:
// - This version is suitable for development/internal testing.
// - Production authentication and per-AI authorization are intentionally
//   handled by a future security layer.
// - x-ai-client identifies the requesting client but is NOT authentication.

import express from "express";
import cors from "cors";
import crypto from "node:crypto";

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

const app = express();

const PORT = Number(
  process.env.PORT || 3000
);

const HOST =
  process.env.HOST || "0.0.0.0";

const SERVICE_NAME =
  "AI Hub Shared Memory";

const API_VERSION = "1.2.0";

const MAX_BODY_SIZE = "1mb";

/* -------------------------------------------------------
   Application configuration
------------------------------------------------------- */

const allowedOrigins =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
    : null;

app.disable("x-powered-by");

/* -------------------------------------------------------
   CORS
------------------------------------------------------- */

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients such as curl,
      // server-to-server AI clients, and local tools.
      if (!origin) {
        return callback(null, true);
      }

      // Development mode:
      // if no origins were configured, allow requests.
      if (!allowedOrigins) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS origin not allowed.")
      );
    }
  })
);

/* -------------------------------------------------------
   Request parsing
------------------------------------------------------- */

app.use(
  express.json({
    limit: MAX_BODY_SIZE
  })
);

/* -------------------------------------------------------
   Request ID
------------------------------------------------------- */

app.use((req, res, next) => {
  const requestId =
    req.header("x-request-id") ||
    crypto.randomUUID();

  req.requestId = requestId;

  res.setHeader(
    "x-request-id",
    requestId
  );

  next();
});

/* -------------------------------------------------------
   Logging
------------------------------------------------------- */

app.use((req, res, next) => {
  const started =
    Date.now();

  res.on("finish", () => {
    const duration =
      Date.now() - started;

    console.log(
      `[${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

function success(
  res,
  data = {},
  status = 200
) {
  return res.status(status).json({
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
  return res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      request_id: res.getHeader(
        "x-request-id"
      )
    }
  });
}

function getClient(req) {
  return (
    req.header("x-ai-client") ||
    "unknown"
  );
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

/* -------------------------------------------------------
   Root
------------------------------------------------------- */

app.get("/", (req, res) => {
  return success(res, {
    service: SERVICE_NAME,
    version: API_VERSION,
    status: "online",
    documentation:
      "/health"
  });
});

/* -------------------------------------------------------
   Health
------------------------------------------------------- */

app.get(
  "/health",
  async (req, res, next) => {
    try {
      const storage =
        await checkMemoryStore();

      return success(res, {
        service: SERVICE_NAME,
        version: API_VERSION,
        status: "healthy",
        storage
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Statistics
------------------------------------------------------- */

app.get(
  "/api/stats",
  async (req, res, next) => {
    try {
      const stats =
        await getMemoryStats();

      return success(res, {
        stats
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Get memories
------------------------------------------------------- */

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

      return success(res, {
        count: memories.length,
        memories
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Get one memory
------------------------------------------------------- */

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

      return success(res, {
        memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Create memory
------------------------------------------------------- */

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
        { memory },
        201
      );
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Update memory
------------------------------------------------------- */

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

      return success(res, {
        memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Archive
------------------------------------------------------- */

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

      return success(res, {
        memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Mark conflict
------------------------------------------------------- */

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

      return success(res, {
        memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Request approval
------------------------------------------------------- */

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

      return success(res, {
        memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Search
------------------------------------------------------- */

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

      return success(res, {
        count: results.length,
        results
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   History
------------------------------------------------------- */

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

      return success(res, {
        count: history.length,
        history
      });
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   Unknown route
------------------------------------------------------- */

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

/* -------------------------------------------------------
   JSON / CORS / application errors
------------------------------------------------------- */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      `[${req.requestId}]`,
      error
    );

    if (res.headersSent) {
      return next(error);
    }

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

    if (
      error.message ===
      "CORS origin not allowed."
    ) {
      return failure(
        res,
        403,
        error.message,
        "CORS_DENIED"
      );
    }

    const message =
      error?.message ||
      "Internal server error.";

    const status =
      message.includes(
        "not found"
      )
        ? 404
        : 400;

    return failure(
      res,
      status,
      message,
      "REQUEST_FAILED"
    );
  }
);

/* -------------------------------------------------------
   Server lifecycle
------------------------------------------------------- */

let server;

async function start() {
  await initializeMemoryStore();

  server = app.listen(
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

  server.close(() => {
    console.log(
      "Shared Memory server stopped."
    );

    process.exit(0);
  });
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
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

/* -------------------------------------------------------
   Start application
------------------------------------------------------- */

start().catch(error => {
  console.error(
    "Failed to start Shared Memory:",
    error
  );

  process.exit(1);
});

export default app;
