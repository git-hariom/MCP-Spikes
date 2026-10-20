
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";

const logFilePath = process.argv[2];

if (!logFilePath) {
  throw new Error("Please provide a log file path.");
}

import {
  loadLogs,
  countBySeverity,
  groupErrors,
  filterByRequestId,
  traceLogs,
  searchLogs,
} from "./logAnalyzer.js";

const server = new McpServer({
  name: "log-analyser",
  version: "1.0.0",
});

server.registerTool(
  "get_log_summary",
  {
    description:
      "Count log entries by severity, including INFO, WARN, ERROR, and UNKNOWN.",
    inputSchema: {},
  },
  async () => {
    const lines = await loadLogs(logFilePath);
    const summary = countBySeverity(lines);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              totalLines: lines.length,
              severityCounts: summary,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "get_grouped_errors",
  {
    description:
      "Group error log entries by their message and return occurrence counts.",
    inputSchema: {},
  },
  async () => {
    const lines = await loadLogs(logFilePath);
    const errors = groupErrors(lines);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(errors, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "search_logs_by_request_id",
  {
    description:
      "Find all log entries matching an exact request ID, such as req-101.",
    inputSchema: {
      requestId: z.string().min(1).describe("The request ID to search for"),
    },
  },
  async ({ requestId }) => {
    const lines = await loadLogs(logFilePath);
    const matches = filterByRequestId(lines, requestId);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              requestId,
              matchCount: matches.length,
              entries: matches,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "trace_logs",
  {
    description:
      "Search JSON log records for any identifier, including request IDs, trace IDs, transaction IDs, correlation IDs, or other values. Searches nested fields regardless of their names.",
    inputSchema: {
      identifier: z
        .string()
        .min(1)
        .describe("Identifier or value to trace across log records"),
    },
  },
  async ({ identifier }) => {
    const records = await loadLogs(logFilePath);
    const matches = traceLogs(records, identifier);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              identifier,
              matchCount: matches.length,
              entries: matches,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);


server.registerTool(
  "search_logs",
  {
    description:
      "Search JSON logs by any field name, nested field path, and optional value. Use '*' as the key to search all fields by value.",
    inputSchema: {
      key: z.string().default("*").describe(
        "Field name, nested path such as context.request_id, or * for any field"
      ),
      value: z.string().default("").describe(
        "Optional value to match within the selected field"
      ),
    },
  },
  async ({ key, value }) => {
    const records = await loadLogs(logFilePath);
    const matches = searchLogs(records, key, value);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              key,
              value,
              matchCount: matches.length,
              entries: matches,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);


const transport = new StdioServerTransport();
await server.connect(transport);
