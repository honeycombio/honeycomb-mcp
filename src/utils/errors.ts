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
      
      // Handle specific error fields that get special formatting
      
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
      
      // Include context information if available
      if (this.details.context) {
        output += `\nContext: ${JSON.stringify(this.details.context, null, 2)}`;
      }
      
      // Include any API response details
      if (this.details.statusCode) {
        output += `\nStatus code: ${this.details.statusCode}`;
      }
      
      if (this.details.contentType) {
        output += `\nContent type: ${this.details.contentType}`;
      }
      
      // Include raw response for debugging, but truncate if too large
      if (this.details.rawResponse) {
        const responseStr = JSON.stringify(this.details.rawResponse);
        const truncated = responseStr.length > 500 ? responseStr.substring(0, 500) + '...' : responseStr;
        output += `\nAPI response: ${truncated}`;
      }
      
      // Include rate limit info
      if (this.details.rateLimit) {
        output += `\nRate limit: ${this.details.rateLimit}`;
      }
      
      // Loop through any other details not already handled
      const handledKeys = ['validationErrors', 'code', 'title', 'detail', 
                           'requestId', 'context', 'statusCode', 'contentType', 
                           'rawResponse', 'rateLimit'];
      
      const otherDetails = Object.entries(this.details)
        .filter(([key]) => !handledKeys.includes(key));
      
      if (otherDetails.length > 0) {
        output += "\n\nAdditional details:";
        otherDetails.forEach(([key, value]) => {
          // For objects or arrays, use JSON stringify with indentation
          if (typeof value === 'object' && value !== null) {
            output += `\n${key}: ${JSON.stringify(value, null, 2)}`;
          } else {
            output += `\n${key}: ${value}`;
          }
        });
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
