import { HoneycombError } from "./errors.js";

/**
 * Handles errors from tool execution and returns a formatted error response
 */
export function handleToolError(
  error: unknown,
  toolName: string,
  options: { suppressConsole?: boolean } = {}
): {
  content: { type: "text"; text: string }[];
  isError: true;
  error?: { message: string };
} {
  let errorMessage = "Unknown error occurred";

  if (error instanceof HoneycombError) {
    errorMessage = `Honeycomb API error (${error.statusCode}): ${error.message}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Skip logging to prevent MCP protocol issues

  return {
    content: [
      {
        type: "text",
        text: `Failed to execute tool '${toolName}': ${errorMessage}\n\n` +
          `Please verify:\n` +
          `- The environment name is correct and configured in .mcp-honeycomb.json\n` +
          `- Your API key is valid\n` +
          `- The dataset exists and you have access to it\n` +
          `- Your query parameters are valid\n`,
      },
    ],
    isError: true,
    error: {
      message: errorMessage
    }
  };
}