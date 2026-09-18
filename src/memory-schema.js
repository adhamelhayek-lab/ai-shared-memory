// AI Hub Shared Memory
// Memory Schema V1.3
//
// Purpose:
// - Define the canonical memory structure
// - Normalize and validate memories before storage
// - Keep AI identities separated
// - Preserve source, authority, confidence, status and history
// - Prevent malformed or oversized memory records
// - Provide a stable foundation for the Shared Memory API
//
// Security:
// - No API keys
// - No wallet secrets
// - No authentication logic
// - IDs use cryptographically secure randomness

import crypto from "node:crypto";

/* =======================================================
   Schema
======================================================= */

export const SCHEMA_VERSION = "1.3.0";

/* =======================================================
   Allowed values
======================================================= */

export const MEMORY_CATEGORIES = Object.freeze([
  "FACT",
  "PREFERENCE",
  "DECISION",
  "PROJECT",
  "LESSON",
  "ARGUMENT",
  "SOURCE",
  "TODO",
  "UNRESOLVED",
  "RESULT",
  "CONTEXT"
]);

export const MEMORY_SOURCES = Object.freeze([
  "user",
  "huda",
  "gock",
  "challenger",
  "chatgpt",
  "trader",
  "system",
  "external_source"
]);

export const MEMORY_AUTHORITIES = Object.freeze([
  "USER",
  "SYSTEM",
  "AI",
  "EXTERNAL_SOURCE"
]);

export const MEMORY_STATUSES = Object.freeze([
  "ACTIVE",
  "ARCHIVED",
  "CONFLICT",
  "PENDING_APPROVAL"
]);

export const MEMORY_VISIBILITY = Object.freeze([
  "shared",
  "private",
  "restricted"
]);

/* =======================================================
   Limits
======================================================= */

export const MEMORY_LIMITS = Object.freeze({
  id: 200,
  title: 500,
  content: 100000,
  related_project: 300,
  tag: 100,
  max_tags: 50,
  max_version: 1000000
});

/* =======================================================
   Defaults
======================================================= */

const DEFAULTS = Object.freeze({
  category: "CONTEXT",
  source_ai: "system",
  authority: "SYSTEM",
  importance: 5,
  confidence: 1,
  status: "ACTIVE",
  visibility: "shared",
  version: 1,
  tags: [],
  related_project: ""
});

/* =======================================================
   Basic utilities
======================================================= */

function now() {
  return new Date().toISOString();
}

function cleanString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function cleanLimitedString(
  value,
  maxLength,
  fallback = ""
) {
  const cleaned = cleanString(value, fallback);

  if (cleaned.length > maxLength) {
    throw new Error(
      `Value exceeds maximum length of ${maxLength} characters.`
    );
  }

  return cleaned;
}

function cleanTags(tags) {
  if (tags === undefined || tags === null) {
    return [];
  }

  if (!Array.isArray(tags)) {
    throw new Error("tags must be an array.");
  }

  if (tags.length > MEMORY_LIMITS.max_tags) {
    throw new Error(
      `A memory may contain at most ${MEMORY_LIMITS.max_tags} tags.`
    );
  }

  const cleaned = [];

  for (const tag of tags) {
    if (typeof tag !== "string") {
      continue;
    }

    const value = tag
      .trim()
      .toLowerCase();

    if (!value) {
      continue;
    }

    if (value.length > MEMORY_LIMITS.tag) {
      throw new Error(
        `A tag may not exceed ${MEMORY_LIMITS.tag} characters.`
      );
    }

    cleaned.push(value);
  }

  return [...new Set(cleaned)];
}

function normalizeNumber(
  value,
  min,
  max,
  fallback
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, number)
  );
}

function normalizeInteger(
  value,
  min,
  max,
  fallback
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(min, number)
  );
}

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return false;
  }

  const parsed =
    Date.parse(value);

  return Number.isFinite(parsed);
}

function isAllowed(
  value,
  allowed
) {
  return allowed.includes(value);
}

function cryptoRandomId() {
  return `mem_${crypto.randomUUID()}`;
}

/* =======================================================
   Public: create memory
======================================================= */

export function createMemory(input = {}) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new TypeError(
      "Memory input must be an object."
    );
  }

  const category =
    cleanString(
      input.category,
      DEFAULTS.category
    ).toUpperCase();

  const sourceAi =
    cleanString(
      input.source_ai,
      DEFAULTS.source_ai
    ).toLowerCase();

  const authority =
    cleanString(
      input.authority,
      DEFAULTS.authority
    ).toUpperCase();

  const status =
    cleanString(
      input.status,
      DEFAULTS.status
    ).toUpperCase();

  const visibility =
    cleanString(
      input.visibility,
      DEFAULTS.visibility
    ).toLowerCase();

  if (
    !isAllowed(
      category,
      MEMORY_CATEGORIES
    )
  ) {
    throw new Error(
      `Invalid category: ${category}`
    );
  }

  if (
    !isAllowed(
      sourceAi,
      MEMORY_SOURCES
    )
  ) {
    throw new Error(
      `Invalid source_ai: ${sourceAi}`
    );
  }

  if (
    !isAllowed(
      authority,
      MEMORY_AUTHORITIES
    )
  ) {
    throw new Error(
      `Invalid authority: ${authority}`
    );
  }

  if (
    !isAllowed(
      status,
      MEMORY_STATUSES
    )
  ) {
    throw new Error(
      `Invalid status: ${status}`
    );
  }

  if (
    !isAllowed(
      visibility,
      MEMORY_VISIBILITY
    )
  ) {
    throw new Error(
      `Invalid visibility: ${visibility}`
    );
  }

  const id =
    cleanLimitedString(
      input.id,
      MEMORY_LIMITS.id
    ) || cryptoRandomId();

  const timestamp =
    cleanString(
      input.timestamp
    ) || now();

  const lastUpdated =
    cleanString(
      input.last_updated
    ) || timestamp;

  const title =
    cleanLimitedString(
      input.title,
      MEMORY_LIMITS.title
    );

  const content =
    cleanLimitedString(
      input.content,
      MEMORY_LIMITS.content
    );

  const relatedProject =
    cleanLimitedString(
      input.related_project,
      MEMORY_LIMITS.related_project,
      DEFAULTS.related_project
    );

  const memory = {
    id,

    schema_version:
      SCHEMA_VERSION,

    timestamp,

    last_updated:
      lastUpdated,

    category,

    source_ai:
      sourceAi,

    authority,

    title,

    content,

    tags:
      cleanTags(input.tags),

    importance:
      normalizeInteger(
        input.importance,
        1,
        10,
        DEFAULTS.importance
      ),

    confidence:
      normalizeNumber(
        input.confidence,
        0,
        1,
        DEFAULTS.confidence
      ),

    status,

    visibility,

    related_project:
      relatedProject,

    version:
      normalizeInteger(
        input.version,
        1,
        MEMORY_LIMITS.max_version,
        DEFAULTS.version
      )
  };

  const validation =
    validateMemory(memory);

  if (!validation.valid) {
    throw new Error(
      `Invalid memory: ${validation.errors.join(" ")}`
    );
  }

  return memory;
}

/* =======================================================
   Public: validate memory
======================================================= */

export function validateMemory(memory) {
  const errors = [];

  if (
    !memory ||
    typeof memory !== "object" ||
    Array.isArray(memory)
  ) {
    return {
      valid: false,
      errors: [
        "Memory must be an object."
      ]
    };
  }

  /* ID */

  if (
    typeof memory.id !== "string" ||
    memory.id.trim() === ""
  ) {
    errors.push(
      "id is required."
    );
  } else if (
    memory.id.length >
    MEMORY_LIMITS.id
  ) {
    errors.push(
      `id exceeds ${MEMORY_LIMITS.id} characters.`
    );
  }

  /* Schema */

  if (
    typeof memory.schema_version !==
      "string" ||
    memory.schema_version.trim() === ""
  ) {
    errors.push(
      "schema_version is required."
    );
  }

  /* Dates */

  if (
    !isValidDate(
      memory.timestamp
    )
  ) {
    errors.push(
      "timestamp must be a valid date."
    );
  }

  if (
    !isValidDate(
      memory.last_updated
    )
  ) {
    errors.push(
      "last_updated must be a valid date."
    );
  }

  /* Category */

  if (
    typeof memory.category !==
      "string" ||
    !MEMORY_CATEGORIES.includes(
      memory.category
    )
  ) {
    errors.push(
      "category is invalid."
    );
  }

  /* Source */

  if (
    typeof memory.source_ai !==
      "string" ||
    !MEMORY_SOURCES.includes(
      memory.source_ai
    )
  ) {
    errors.push(
      "source_ai is invalid."
    );
  }

  /* Authority */

  if (
    typeof memory.authority !==
      "string" ||
    !MEMORY_AUTHORITIES.includes(
      memory.authority
    )
  ) {
    errors.push(
      "authority is invalid."
    );
  }

  /* Title */

  if (
    typeof memory.title !==
      "string"
  ) {
    errors.push(
      "title must be a string."
    );
  } else if (
    memory.title.length >
    MEMORY_LIMITS.title
  ) {
    errors.push(
      `title exceeds ${MEMORY_LIMITS.title} characters.`
    );
  }

  /* Content */

  if (
    typeof memory.content !==
      "string" ||
    memory.content.trim() === ""
  ) {
    errors.push(
      "content is required."
    );
  } else if (
    memory.content.length >
    MEMORY_LIMITS.content
  ) {
    errors.push(
      `content exceeds ${MEMORY_LIMITS.content} characters.`
    );
  }

  /* Tags */

  if (
    !Array.isArray(memory.tags)
  ) {
    errors.push(
      "tags must be an array."
    );
  } else {
    if (
      memory.tags.length >
      MEMORY_LIMITS.max_tags
    ) {
      errors.push(
        `too many tags; maximum is ${MEMORY_LIMITS.max_tags}.`
      );
    }

    for (const tag of memory.tags) {
      if (
        typeof tag !==
        "string"
      ) {
        errors.push(
          "every tag must be a string."
        );
        break;
      }

      if (
        tag.length >
        MEMORY_LIMITS.tag
      ) {
        errors.push(
          `a tag exceeds ${MEMORY_LIMITS.tag} characters.`
        );
        break;
      }
    }
  }

  /* Importance */

  if (
    !Number.isInteger(
      memory.importance
    ) ||
    memory.importance < 1 ||
    memory.importance > 10
  ) {
    errors.push(
      "importance must be an integer from 1 to 10."
    );
  }

  /* Confidence */

  if (
    typeof memory.confidence !==
      "number" ||
    !Number.isFinite(
      memory.confidence
    ) ||
    memory.confidence < 0 ||
    memory.confidence > 1
  ) {
    errors.push(
      "confidence must be a number from 0 to 1."
    );
  }

  /* Status */

  if (
    typeof memory.status !==
      "string" ||
    !MEMORY_STATUSES.includes(
      memory.status
    )
  ) {
    errors.push(
      "status is invalid."
    );
  }

  /* Visibility */

  if (
    typeof memory.visibility !==
      "string" ||
    !MEMORY_VISIBILITY.includes(
      memory.visibility
    )
  ) {
    errors.push(
      "visibility is invalid."
    );
  }

  /* Related project */

  if (
    typeof memory.related_project !==
      "string"
  ) {
    errors.push(
      "related_project must be a string."
    );
  } else if (
    memory.related_project.length >
    MEMORY_LIMITS.related_project
  ) {
    errors.push(
      `related_project exceeds ${MEMORY_LIMITS.related_project} characters.`
    );
  }

  /* Version */

  if (
    !Number.isInteger(
      memory.version
    ) ||
    memory.version < 1 ||
    memory.version >
      MEMORY_LIMITS.max_version
  ) {
    errors.push(
      "version is invalid."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

/* =======================================================
   Public: normalize existing memory
======================================================= */

export function normalizeMemory(
  memory
) {
  return createMemory(
    memory
  );
}

/* =======================================================
   Public: schema information
======================================================= */

export function getSchemaInfo() {
  return {
    schema_version:
      SCHEMA_VERSION,

    categories:
      [...MEMORY_CATEGORIES],

    sources:
      [...MEMORY_SOURCES],

    authorities:
      [...MEMORY_AUTHORITIES],

    statuses:
      [...MEMORY_STATUSES],

    visibility:
      [...MEMORY_VISIBILITY],

    limits:
      { ...MEMORY_LIMITS }
  };
}
