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
    api?: any;
  } = {}
): Promise<{
  content: { type: "text"; text: string }[];
  error: { 
    message: string;
    details?: Record<string, any>;
  };
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

  // Store the detailed error information for debugging
  const errorWithDetails = error instanceof HoneycombError ? 
    error.getFormattedMessage(true) : errorMessage;
  
  // For the content text, include complete information with details
  const helpText = `Failed to execute tool '${toolName}': ${errorWithDetails}`;

  // For the error.message, include just the core message without duplicating verification steps
  const coreErrorMessage = error instanceof HoneycombError ? 
    error.message : errorMessage;

  return {
    content: [
      {
        type: "text",
        text: helpText,
      },
    ],
    error: {
      message: coreErrorMessage,
      details: errorDetails
    }
  };
}