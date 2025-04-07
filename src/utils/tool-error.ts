import { HoneycombError } from "./errors.js";
import { z } from "zod";

/**
 * Handles errors from tool execution and returns a formatted error response
 * 
 * This follows the required format for tool errors:
 * { isError: true, content: [{ type: "text", text: "Error message" }] }
 */
export async function handleToolError(
  error: unknown,
  toolName: string,
  options: { 
    suppressConsole?: boolean;
    environment?: string;
    dataset?: string;
    api?: any;
  } = {}
): Promise<{
  isError: true;
  content: { type: "text"; text: string }[];
}> {
  let errorMessage = "Unknown error occurred";
  let errorDetails: Record<string, any> = {};

  if (error instanceof HoneycombError) {
    // Use the enhanced error message system
    // Get a clean message without duplicating technical details
    errorMessage = error.message;
    errorDetails = error.details;
  } else if (error instanceof z.ZodError) {
    // For Zod validation errors, create a validation error with context
    const validationError = HoneycombError.createValidationError(
      error.errors.map(err => err.message).join(", "),
      {
        environment: options.environment,
        dataset: options.dataset
      },
      options.api
    );
    // Add the Zod errors as details
    validationError.addDetails({
      zodErrors: error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }))
    });
    errorMessage = validationError.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Log the error to stderr for debugging, unless suppressed
  if (!options.suppressConsole) {
    console.error(`Tool '${toolName}' failed:`, error);
  }

  // Format the error message for the content text - maintain the expected format for tests
  const displayMessage = `Failed to execute tool '${toolName}': ${errorMessage}`;

  // Return the error in the exact format required by the tool API
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: displayMessage,
      },
    ]
  };
}