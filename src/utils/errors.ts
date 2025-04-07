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
    public suggestions: string[] = [],
    public details: Record<string, any> = {}
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
      `Query validation failed: ${message}\n\nSuggested next steps:\n- ${contextStr}\n\nPlease verify:\n- The environment name is correct and configured via HONEYCOMB_API_KEY or HONEYCOMB_ENV_*_API_KEY\n- Your API key is valid\n- The dataset exists and you have access to it\n- Your query parameters are valid`,
      [],
      { context }
    );
  }

  /**
   * Add additional details to the error
   */
  addDetails(details: Record<string, any>): this {
    this.details = { ...this.details, ...details };
    return this;
  }

  /**
   * Get a formatted error message including suggestions and optionally details
   */
  getFormattedMessage(includeDetails: boolean = false): string {
    let output = this.message;
    
    if (this.suggestions.length > 0) {
      output += "\n\nSuggested next steps:";
      this.suggestions.forEach(suggestion => {
        output += `\n- ${suggestion}`;
      });
    }
    
    // Include error details for debugging if requested
    if (includeDetails && Object.keys(this.details).length > 0) {
      output += "\n\nError details:";
      
      // Handle validation errors specially
      if (this.details.validationErrors) {
        output += "\nValidation errors:";
        if (Array.isArray(this.details.validationErrors)) {
          this.details.validationErrors.forEach((err: any, i: number) => {
            output += `\n  ${i+1}. ${typeof err === 'string' ? err : JSON.stringify(err)}`;
          });
        } else {
          output += `\n  ${JSON.stringify(this.details.validationErrors)}`;
        }
      }
      
      // Add API-specific error codes if available
      if (this.details.code) {
        output += `\nError code: ${this.details.code}`;
      }
      
      // Add JSONAPI error details if available
      if (this.details.title) {
        output += `\nTitle: ${this.details.title}`;
      }
      if (this.details.detail) {
        output += `\nDetail: ${this.details.detail}`;
      }
      
      // Include request ID for support if available
      if (this.details.requestId) {
        output += `\nRequest ID: ${this.details.requestId}`;
      }
    }
    
    return output;
  }
}

/**
 * Error class for query-specific errors
 */
export class QueryError extends HoneycombError {
  constructor(
    message: string, 
    suggestions: string[] = [],
    details: Record<string, any> = {}
  ) {
    super(400, message, suggestions, details);
    this.name = "QueryError";
  }
}
