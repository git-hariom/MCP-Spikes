
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { access } from "node:fs/promises";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "qwen3:4b";

const client = new Client({
  name: "log-analyser-client",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["./server.js"],
});

async function askOllama(messages, tools = []) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP error: ${response.status}`);
  }

  return response.json();
}

function convertMcpToolsToOllama(mcpTools) {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema,
    },
  }));
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  let client;

  try {
    const enteredPath = await rl.question(
      "Enter the path to your log file: "
    );

    const logFilePath = path.resolve(enteredPath.trim());

    await access(logFilePath);

    console.log(`Selected file: ${logFilePath}`);

    client = new Client({
      name: "log-analyser-client",
      version: "1.0.0",
    });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["./server.js", logFilePath],
    });

    await client.connect(transport);

    const { tools: mcpTools } = await client.listTools();
    const ollamaTools = convertMcpToolsToOllama(mcpTools);

    console.log("Log analyser ready. Type 'exit' to quit.");

    while (true) {
      const question = await rl.question("\nYou: ");

      if (question.trim().toLowerCase() === "exit") break;

      const messages = [
        {
          role: "system",
          content:
            "You are a log analysis assistant. Use the tools to inspect " +
            "the selected log file before answering questions about it. " +
            "Do not invent log entries or unsupported root causes.",
        },
        { role: "user", content: question },
      ];

      let result = await askOllama(messages, ollamaTools);
      let iterations = 0;

      while (
        (result.message?.tool_calls?.length ?? 0) > 0 &&
        iterations < 5
      ) {
        messages.push(result.message);
        iterations++;

        for (const call of result.message.tool_calls) {
          const name = call.function.name;
          const args = call.function.arguments ?? {};

          if (!mcpTools.some((tool) => tool.name === name)) {
            messages.push({
              role: "tool",
              content: `Unknown tool: ${name}`,
            });
            continue;
          }

          console.log(`[Calling MCP tool: ${name}]`);

          const toolResult = await client.callTool({
            name,
            arguments: args,
          });

          const text = (toolResult.content ?? [])
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n");

          messages.push({
            role: "tool",
            content: text || "No text returned.",
          });
        }

        result = await askOllama(messages, ollamaTools);
      }

      console.log("\nAssistant:", result.message?.content ?? "(No response)");
    }
  } finally {
    rl.close();
    if (client) await client.close();
  }
}

main().catch((error) => {
  console.error("Log analyser error:", error.message);
  process.exitCode = 1;
});
