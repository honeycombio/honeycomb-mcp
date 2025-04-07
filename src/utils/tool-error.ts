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
  let errorDetails: Record<string, any> = {};

  if (error instanceof HoneycombError) {
    // Use the enhanced error message system with details
    errorMessage = error.getFormattedMessage(true);
    errorDetails = error.details;
  } else if (error instanceof z.ZodError) {
    // For Zod validation errors, create a validation error with context
    const validationError = HoneycombError.createValidationError(
      error.errors.map(err => err.message).join(", "),
      {
        environment: options.environment,
        dataset: options.dataset
      }
    );
    // Add the Zod errors as details
    validationError.addDetails({
      zodErrors: error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }))
    });
    errorMessage = validationError.getFormattedMessage(true);
    errorDetails = validationError.details;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = { errorType: error.name, stack: error.stack };
  }

  // Log the error to stderr for debugging, unless suppressed
  if (!options.suppressConsole) {
    console.error(`Tool '${toolName}' failed:`, error);
  }

  let helpText = `Failed to execute tool '${toolName}': ${errorMessage}\n\n` +
    `Please verify:\n` +
    `- The environment name is correct and configured via HONEYCOMB_API_KEY or HONEYCOMB_ENV_*_API_KEY\n` +
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