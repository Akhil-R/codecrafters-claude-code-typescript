import OpenAI from "openai";
import { exec } from "child_process";

const readTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  "type": "function",
  "function": {
    "name": "Read",
    "description": "Read and return the contents of a file",
    "parameters": {
      "type": "object",
      "properties": {
        "file_path": {
          "type": "string",
          "description": "The path to the file to read"
        }
      },
      "required": ["file_path"]
    }
  }
};

const writeTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  "type": "function",
  "function": {
    "name": "Write",
    "description": "Write content to a file",
    "parameters": {
      "type": "object",
      "required": ["file_path", "content"],
      "properties": {
        "file_path": {
          "type": "string",
          "description": "The path of the file to write to"
        },
        "content": {
          "type": "string",
          "description": "The content to write to the file"
        }
      }
    }
  }
};

const bashTool: OpenAI.Chat.Completions.ChatCompletionTool = {
  "type": "function",
  "function": {
    "name": "Bash",
    "description": "Execute a shell command",
    "parameters": {
      "type": "object",
      "required": ["command"],
      "properties": {
        "command": {
          "type": "string",
          "description": "The command to execute"
        }
      }
    }
  }
};

const toolDefinitions = [readTool, writeTool, bashTool];

async function executeTool(toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall) {
  const args = JSON.parse(toolCall.function.arguments);

  if (toolCall.function.name === "Read") {
    return await Bun.file(args.file_path).text();
  }

  if (toolCall.function.name === "Write") {
    await Bun.write(args.file_path, args.content);
    return "File written successfully";
  }

  if (toolCall.function.name === "Bash") {
    return new Promise((resolve) => {
      exec(args.command, (error, stdout, stderr) => {
        resolve(JSON.stringify({
          stdout,
          stderr,
        }));
      });
    });
  }

  throw new Error(`Unknown tool: ${toolCall.function.name}`);
}

async function main() {
  const [, , flag, prompt] = process.argv;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseURL =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (flag !== "-p" || !prompt) {
    throw new Error("error: -p flag is required");
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: prompt },
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      messages: messages,
      tools: toolDefinitions,
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error("no choices in response");
    }

    const message = response.choices[0].message;

    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log(message.content);
      break;
    }

    for (const toolCall of message.tool_calls) {
      const result = await executeTool(toolCall);

      messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });

    }

  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  console.error("Logs from your program will appear here!");
}

main();
