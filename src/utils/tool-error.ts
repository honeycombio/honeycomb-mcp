import { HoneycombError } from "./errors.js";
import { z } from "zod";

/**
 * Handles errors from tool execution and returns a formatted error response
 */
export async function handleToolError(
  error: unknown,
  toolName: string,
  options: { 
    suppressConsole?: boolean;
    environment?: string;
    dataset?: string;
  } = {}
): Promise<{
  content: { type: "text"; text: string }[];
  error: { message: string; };
}> {
  let errorMessage = "Unknown error occurred";
  let suggestions: string[] = [];

  if (error instanceof HoneycombError) {
    // Use the enhanced error message system
    errorMessage = error.getFormattedMessage();
  } else if (error instanceof z.ZodError) {
    // For Zod validation errors, create a validation error with context
    const validationError = HoneycombError.createValidationError(
      error.errors.map(err => err.message).join(", "),
      {
        environment: options.environment,
        dataset: options.dataset
      }
    );
    errorMessage = validationError.getFormattedMessage();
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Log the error to stderr for debugging, unless suppressed
  if (!options.suppressConsole) {
    console.error(`Tool '${toolName}' failed:`, error);
  }

  let helpText = `Failed to execute tool '${toolName}': ${errorMessage}\n\n` +
    `Please verify:\n` +
    `- The environment name is correct and configured in .mcp-honeycomb.json\n` +
    `- Your API key is valid\n` +
    `- The dataset exists and you have access to it\n` +
    `- Your query parameters are valid\n`;

  return {
    content: [
      {
        type: "text",
        text: helpText,
      },
    ],
    error: {
      message: errorMessage
    }
  };
}