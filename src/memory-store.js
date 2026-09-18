// AI Hub Shared Memory
// Memory Store V1.2
//
// Purpose:
// - Persist memories locally
// - Validate every memory
// - Create, read, update, archive, and search memories
// - Preserve complete memory history
// - Prevent accidental data loss
// - Keep storage independent from the API layer
//
// Storage:
// data/memories.json
//
// Important:
// - This layer does NOT authenticate clients.
// - This layer does NOT expose HTTP.
// - This layer does NOT execute AI decisions.
// - Authentication/authorization belong to higher layers.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createMemory,
  validateMemory
} from "./memory-schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_FILE = path.join(DATA_DIR, "memories.json");
const TEMP_FILE = path.join(DATA_DIR, "memories.tmp.json");

const DATABASE_VERSION = 1;

const EMPTY_DATABASE = {
  version: DATABASE_VERSION,
  memories: [],
  history: []
};

// Simple in-process write queue.
// This prevents two simultaneous writes from corrupting
// the local JSON database.
let writeQueue = Promise.resolve();

/* -------------------------------------------------------
   Internal helpers
------------------------------------------------------- */

function getTimestamp() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function queueWrite(operation) {
  const next = writeQueue.then(operation);

  writeQueue = next.catch(() => {});

  return next;
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(MEMORY_FILE);
  } catch {
    await writeDatabase(EMPTY_DATABASE);
  }
}

async function readDatabase() {
  await ensureStorage();

  const raw = await fs.readFile(MEMORY_FILE, "utf8");

  let database;

  try {
    database = JSON.parse(raw);
  } catch {
    throw new Error(
      "Memory database contains invalid JSON."
    );
  }

  if (
    !database ||
    typeof database !== "object" ||
    !Array.isArray(database.memories) ||
    !Array.isArray(database.history)
  ) {
    throw new Error(
      "Memory database has an invalid structure."
    );
  }

  return database;
}

async function writeDatabase(database) {
  const serialized = JSON.stringify(
    database,
    null,
    2
  );

  await queueWrite(async () => {
    await fs.mkdir(DATA_DIR, {
      recursive: true
    });

    await fs.writeFile(
      TEMP_FILE,
      serialized,
      "utf8"
    );

    await fs.rename(
      TEMP_FILE,
      MEMORY_FILE
    );
  });
}

function createHistoryEntry({
  action,
  memoryId,
  actor,
  previousMemory = null,
  newMemory = null,
  reason = null
}) {
  return {
    id: crypto.randomUUID(),
    timestamp: getTimestamp(),
    action,
    memory_id: memoryId,
    actor,
    previous_memory: previousMemory,
    new_memory: newMemory,
    reason
  };
}

function validateActor(actor) {
  if (
    typeof actor !== "string" ||
    actor.trim() === ""
  ) {
    throw new Error(
      "A valid actor is required."
    );
  }

  return actor.trim();
}

/* -------------------------------------------------------
   Create
------------------------------------------------------- */

export async function addMemory(
  input,
  actor = "system"
) {
  const validatedActor = validateActor(actor);

  const memory = createMemory(input);

  const database = await readDatabase();

  const exists = database.memories.some(
    item => item.id === memory.id
  );

  if (exists) {
    throw new Error(
      `Memory already exists: ${memory.id}`
    );
  }

  database.memories.push(memory);

  database.history.push(
    createHistoryEntry({
      action: "CREATE",
      memoryId: memory.id,
      actor: validatedActor,
      newMemory: memory
    })
  );

  await writeDatabase(database);

  return clone(memory);
}

/* -------------------------------------------------------
   Read
------------------------------------------------------- */

export async function getMemory(id) {
  if (
    typeof id !== "string" ||
    id.trim() === ""
  ) {
    return null;
  }

  const database = await readDatabase();

  const memory = database.memories.find(
    item => item.id === id
  );

  return memory
    ? clone(memory)
    : null;
}

export async function getAllMemories({
  includeArchived = false,
  limit = 500
} = {}) {
  const database = await readDatabase();

  const safeLimit = Math.min(
    Math.max(Number(limit) || 500, 1),
    5000
  );

  const memories = includeArchived
    ? database.memories
    : database.memories.filter(
        memory =>
          memory.status !== "ARCHIVED"
      );

  return clone(
    memories.slice(0, safeLimit)
  );
}

/* -------------------------------------------------------
   Update
------------------------------------------------------- */

export async function updateMemory(
  id,
  changes = {},
  actor = "system",
  reason = null
) {
  const validatedActor = validateActor(actor);

  if (
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes)
  ) {
    throw new TypeError(
      "Memory changes must be an object."
    );
  }

  const database = await readDatabase();

  const index = database.memories.findIndex(
    memory => memory.id === id
  );

  if (index === -1) {
    throw new Error(
      `Memory not found: ${id}`
    );
  }

  const previous = database.memories[index];

  // Never allow an update to silently replace
  // the identity or original creation timestamp.
  const updatedInput = {
    ...previous,
    ...changes,

    id: previous.id,
    timestamp: previous.timestamp,

    // IMPORTANT:
    // Always update this field here rather than
    // accidentally preserving the previous timestamp.
    last_updated: getTimestamp(),

    version: previous.version + 1
  };

  const updated = createMemory(
    updatedInput
  );

  const validation =
    validateMemory(updated);

  if (!validation.valid) {
    throw new Error(
      `Updated memory is invalid: ${validation.errors.join(
        " "
      )}`
    );
  }

  database.memories[index] = updated;

  database.history.push(
    createHistoryEntry({
      action: "UPDATE",
      memoryId: id,
      actor: validatedActor,
      previousMemory: previous,
      newMemory: updated,
      reason
    })
  );

  await writeDatabase(database);

  return clone(updated);
}

/* -------------------------------------------------------
   Archive
------------------------------------------------------- */

export async function archiveMemory(
  id,
  actor = "system",
  reason = "Memory archived"
) {
  return updateMemory(
    id,
    {
      status: "ARCHIVED"
    },
    actor,
    reason
  );
}

/* -------------------------------------------------------
   Conflict handling
------------------------------------------------------- */

export async function markMemoryConflict(
  id,
  actor = "system",
  reason = "Memory conflict detected"
) {
  return updateMemory(
    id,
    {
      status: "CONFLICT"
    },
    actor,
    reason
  );
}

/* -------------------------------------------------------
   Approval
------------------------------------------------------- */

export async function requestMemoryApproval(
  id,
  actor = "system",
  reason = "Approval required"
) {
  return updateMemory(
    id,
    {
      status: "PENDING_APPROVAL"
    },
    actor,
    reason
  );
}

/* -------------------------------------------------------
   Search
------------------------------------------------------- */

export async function searchMemories({
  query = "",
  category = null,
  source_ai = null,
  related_project = null,
  status = "ACTIVE",
  limit = 50
} = {}) {
  const database = await readDatabase();

  const normalizedQuery =
    typeof query === "string"
      ? query.trim().toLowerCase()
      : "";

  const safeLimit = Math.min(
    Math.max(Number(limit) || 50, 1),
    500
  );

  const results =
    database.memories.filter(memory => {
      if (
        status !== null &&
        memory.status !== status
      ) {
        return false;
      }

      if (
        category !== null &&
        memory.category !== category
      ) {
        return false;
      }

      if (
        source_ai !== null &&
        memory.source_ai !== source_ai
      ) {
        return false;
      }

      if (
        related_project !== null &&
        memory.related_project !==
          related_project
      ) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        memory.title,
        memory.content,
        memory.category,
        memory.source_ai,
        memory.related_project,
        ...memory.tags
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(
        normalizedQuery
      );
    });

  results.sort((a, b) => {
    if (
      b.importance !== a.importance
    ) {
      return (
        b.importance -
        a.importance
      );
    }

    return (
      new Date(
        b.last_updated
      ).getTime() -
      new Date(
        a.last_updated
      ).getTime()
    );
  });

  return clone(
    results.slice(0, safeLimit)
  );
}

/* -------------------------------------------------------
   History
------------------------------------------------------- */

export async function getMemoryHistory(
  id,
  limit = 100
) {
  const database = await readDatabase();

  const safeLimit = Math.min(
    Math.max(Number(limit) || 100, 1),
    1000
  );

  const history =
    database.history.filter(
      entry =>
        entry.memory_id === id
    );

  return clone(
    history.slice(-safeLimit)
  );
}

/* -------------------------------------------------------
   Statistics
------------------------------------------------------- */

export async function getMemoryStats() {
  const database = await readDatabase();

  const stats = {
    database_version:
      database.version,

    total:
      database.memories.length,

    active: 0,

    archived: 0,

    conflicts: 0,

    pending_approval: 0,

    history_entries:
      database.history.length
  };

  for (const memory of database.memories) {
    switch (memory.status) {
      case "ACTIVE":
        stats.active++;
        break;

      case "ARCHIVED":
        stats.archived++;
        break;

      case "CONFLICT":
        stats.conflicts++;
        break;

      case "PENDING_APPROVAL":
        stats.pending_approval++;
        break;
    }
  }

  return stats;
}

/* -------------------------------------------------------
   Maintenance
------------------------------------------------------- */

export async function initializeMemoryStore() {
  await ensureStorage();

  return {
    initialized: true,
    database_file: MEMORY_FILE
  };
}

export async function checkMemoryStore() {
  const database =
    await readDatabase();

  return {
    healthy: true,
    database_version:
      database.version,
    memory_count:
      database.memories.length,
    history_count:
      database.history.length
  };
}
