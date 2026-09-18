// AI Hub Shared Memory
// Memory Schema V1.1
//
// Purpose:
// - Define the canonical memory structure
// - Validate memory before storage
// - Keep AI identities separated
// - Preserve source, authority, confidence, and history
// - Provide a stable foundation for future database/API layers

export const SCHEMA_VERSION = "1.1.0";

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

const DEFAULTS = Object.freeze({
  category: "CONTEXT",
  source_ai: "system",
  authority: "SYSTEM",
  importance: 5,
  confidence: 1,
  status: "ACTIVE",
  visibility: "shared",
  version: 1
});

function now() {
  return new Date().toISOString();
}

function cleanString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [
    ...new Set(
      tags
        .filter(tag => typeof tag === "string")
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}

function normalizeNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min,
