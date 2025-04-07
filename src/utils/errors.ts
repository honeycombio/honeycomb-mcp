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
    context: ValidationErrorContext,
    api?: any
  ): HoneycombError {
    // Format the context as a string for display
    const contextStr = Object.entries(context)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}="${value}"`)
      .join(", ");
    
    // Start building suggestions based on the error and context
    const suggestions: string[] = [];
    
    // Add context information as first suggestion
    if (contextStr) {
      suggestions.push(contextStr);
    }
    
    // Create detailed verification steps based on the error type and context
    let verificationSteps: string[] = [];
    
    // If we have access to the API client, we can provide more specific help
    if (api && typeof api.getEnvironments === 'function') {
      const environments = api.getEnvironments();
      
      // Environment-related suggestions
      if (context.environment) {
        if (!environments.includes(context.environment)) {
          // Environment doesn't exist
          verificationSteps.push(`The environment "${context.environment}" was not found. Available environments: ${environments.join(", ")}`);
        } else {
          // Environment exists, so API key is valid - issue is likely with dataset or query
          if (context.dataset) {
            verificationSteps.push(`Verify the dataset "${context.dataset}" exists in environment "${context.environment}" and you have access to it`);
          }
          verificationSteps.push("Check your query parameters for syntax or logical errors");
        }
      } else {
        // No environment specified
        verificationSteps.push(`Specify a valid environment. Available environments: ${environments.join(", ")}`);
      }
    } else {
      // Without API client, give more generic suggestions
      if (context.environment) {
        verificationSteps.push(`Verify the environment "${context.environment}" is correctly configured`);
      } else {
        verificationSteps.push("Specify a valid environment name");
      }
      
      if (context.dataset) {
        verificationSteps.push(`Verify the dataset "${context.dataset}" exists and you have access to it`);
      }
      
      // Always suggest checking query parameters
      verificationSteps.push("Check that your query parameters follow the required format and constraints");
    }
    
    // Add specific advice based on the error message
    if (message.includes("time_range") || message.includes("start_time") || message.includes("end_time")) {
      verificationSteps.push("Check your time range parameters - either use time_range OR start_time and end_time together");
    }
    
    if (message.includes("calculations") || message.includes("calculation")) {
      verificationSteps.push("For COUNT operations, DO NOT include a column field");
      verificationSteps.push("For all other operations, a column field is REQUIRED");
    }
    
    // Build the final error message
    const baseMessage = `Query validation failed: ${message}`;
    const suggestionsText = suggestions.length > 0 ? 
      `\n\nSuggested next steps:\n${suggestions.map(s => `- ${s}`).join("\n")}` : "";
    const verificationText = verificationSteps.length > 0 ? 
      `\n\nPlease verify:\n${verificationSteps.map(s => `- ${s}`).join("\n")}` : "";
    
    return new HoneycombError(
      422,
      `${baseMessage}${suggestionsText}${verificationText}`,
      suggestions,
      { 
        context,
        verificationSteps
      }
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
