/**
 * Base error class for Honeycomb API errors
 */
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
    context?: {
      environment?: string;
      dataset?: string;
      granularity?: number;
    }
  ): HoneycombError {
    const suggestions: string[] = [];
    let enhancedMessage = "Query validation failed: ";

    if (context?.granularity !== undefined) {
      enhancedMessage += "The granularity parameter might be causing issues. Try: ";
      suggestions.push(
        "1. Ensure you're specifying a time window (time_range or start_time+end_time)",
        "2. Make sure granularity value isn't too small for your time window",
        "3. Consider removing granularity and other advanced parameters for a simpler query first"
      );
    } else {
      enhancedMessage += message;
    }

    // Add get-columns suggestion if we have environment and dataset context
    if (context?.environment && context?.dataset) {
      suggestions.push(
        `Try using mcp_honeycomb_get_columns with environment="${context.environment}" and dataset="${context.dataset}" to see available columns and their types.`
      );
    }

    return new HoneycombError(422, enhancedMessage, suggestions);
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
