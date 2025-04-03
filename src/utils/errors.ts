/**
 * Base error class for Honeycomb API errors
 */
export interface ValidationErrorContext {
  environment?: string;
  dataset?: string;
  granularity?: number;
  api_route?: string;
}

export class HoneycombError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public suggestions: string[] = []
  ) {
    super(message);
    this.name = "HoneycombError";
  }

  /**
   * Factory method for creating validation errors with appropriate suggestions
   */
  static createValidationError(
    message: string,
    context: ValidationErrorContext
  ): HoneycombError {
    const contextStr = Object.entries(context)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}="${value}"`)
      .join(", ");

    return new HoneycombError(
      422,
      `Query validation failed: ${message}\n\nSuggested next steps:\n- ${contextStr}\n\nPlease verify:\n- The environment name is correct and configured in .mcp-honeycomb.json\n- Your API key is valid\n- The dataset exists and you have access to it\n- Your query parameters are valid`
    );
  }

  /**
   * Get a formatted error message including suggestions
   */
  getFormattedMessage(): string {
    let output = this.message;
    if (this.suggestions.length > 0) {
      output += "\n\nSuggested next steps:";
      this.suggestions.forEach(suggestion => {
        output += `\n- ${suggestion}`;
      });
    }
    return output;
  }
}

/**
 * Error class for query-specific errors
 */
export class QueryError extends HoneycombError {
  constructor(message: string, suggestions: string[] = []) {
    super(400, message, suggestions);
    this.name = "QueryError";
  }
}
