import { HoneycombError } from "./errors.js";

/**
 * Handles errors from tool execution and returns a formatted error response
 */
export async function handleToolError(
  error: unknown,
  toolName: string,
  options: { suppressConsole?: boolean } = {}
): Promise<{
  content: { type: "text"; text: string }[];
  error: { message: string; };
}> {
  let errorMessage = "Unknown error occurred";

  if (error instanceof HoneycombError) {
    errorMessage = `Honeycomb API error (${error.statusCode}): ${error.message}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Log the error to stderr for debugging, unless suppressed
  if (!options.suppressConsole) {
    console.error(`Tool '${toolName}' failed:`, error);
  }

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
    error: {
      message: errorMessage
    }
  };
}