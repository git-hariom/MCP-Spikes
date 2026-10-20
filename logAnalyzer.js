import { readFile } from "node:fs/promises";

export async function loadLogs(filePath) {
  const content = await readFile(filePath, "utf8");

  let data;

  // First, try parsing the entire file as JSON.
  try {
    data = JSON.parse(content);
  } catch {
    // If that fails, try JSON Lines.
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim());

    try {
      data = lines.map((line) => JSON.parse(line));
    } catch {
      throw new Error(
        "Invalid JSON file. Expected JSON or JSON Lines."
      );
    }
  }

  const records = extractRecords(data);

  // Keep each record searchable, regardless of its schema.
  return records.map((record, index) =>
    JSON.stringify({
      __recordNumber: index + 1,
      ...record,
    })
  );
}

function extractRecords(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    // Support common wrappers around arrays of logs.
    for (const key of ["logs", "events", "records", "entries"]) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  // A single JSON object is one log record.
  return [data];
}

export function countBySeverity(lines) {
  const counts = {
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    DEBUG: 0,
    UNKNOWN: 0,
  };

  for (const line of lines) {
    const match = line.match(
      /\b(INFO|WARN(?:ING)?|ERROR|DEBUG|FATAL|CRITICAL)\b/i
    );

    if (!match) {
      counts.UNKNOWN++;
      continue;
    }

    const level = match[1].toUpperCase();
    const severity = level === "WARNING" ? "WARN" :
      level === "FATAL" || level === "CRITICAL" ? "ERROR" : level;

    if (severity in counts) {
      counts[severity]++;
    } else {
      counts.UNKNOWN++;
    }
  }

  return counts;
}

export function groupErrors(lines) {
  const errors = {};

  for (const line of lines) {
    if (!/\b(ERROR|FATAL|CRITICAL)\b/i.test(line)) {
      continue;
    }

    const message = line
      .replace(/^\S+\s+/, "")
      .replace(/\b(ERROR|FATAL|CRITICAL)\b/i, "")
      .replace(/\s+requestId=\S+/g, "")
      .trim();

    errors[message] = (errors[message] || 0) + 1;
  }

  return errors;
}

export function filterByRequestId(records, requestId) {
  const target = requestId.trim().toLowerCase();

  if (!target) {
    return [];
  }

  return records.filter((record) => {
    const searchable =
      typeof record === "string"
        ? record
        : JSON.stringify(record);

    return searchable.toLowerCase().includes(target);
  });
}

export function traceLogs(records, identifier) {
  const target = identifier.trim().toLowerCase();

  if (!target) {
    return [];
  }

  return records.filter((record) => {
    const searchable =
      typeof record === "string"
        ? record
        : JSON.stringify(record);

    return searchable.toLowerCase().includes(target);
  });
}


function parseRecord(record) {
  if (typeof record !== "string") {
    return record;
  }

  try {
    return JSON.parse(record);
  } catch {
    return { message: record };
  }
}

function getNestedValues(obj, targetKey, path = "") {
  const results = [];

  if (obj === null || typeof obj !== "object") {
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (
      targetKey === "*" ||
      key.toLowerCase() === targetKey.toLowerCase() ||
      currentPath.toLowerCase() === targetKey.toLowerCase()
    ) {
      results.push({
        key,
        path: currentPath,
        value,
      });
    }

    if (value !== null && typeof value === "object") {
      results.push(...getNestedValues(value, targetKey, currentPath));
    }
  }

  return results;
}


function findKeyMatches(obj, targetKey, path = "") {
  const found = [];

  if (obj === null || typeof obj !== "object") {
    return found;
  }

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    if (
      targetKey === "*" ||
      key.toLowerCase() === targetKey.toLowerCase() ||
      currentPath.toLowerCase() === targetKey.toLowerCase()
    ) {
      found.push({ key, path: currentPath, value });
    }

    if (value !== null && typeof value === "object") {
      found.push(...findKeyMatches(value, targetKey, currentPath));
    }
  }

  return found;
}

export function searchLogs(records, key = "*", value = "") {
  const targetKey = key.trim() || "*";
  const targetValue =
  value.trim() === "*" ? "" : value.trim().toLowerCase();

  return records.filter((record) => {
    let parsed;

    try {
      parsed = typeof record === "string"
        ? JSON.parse(record)
        : record;
    } catch {
      return false;
    }

    const matches = findKeyMatches(parsed, targetKey);

    // Key-only search: the field exists.
    if (!targetValue) {
      return matches.length > 0;
    }

    // Key + value search.
    return matches.some((match) =>
      JSON.stringify(match.value)
        .toLowerCase()
        .includes(targetValue)
    );
  });
}


