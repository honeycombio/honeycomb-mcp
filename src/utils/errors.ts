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
    api?: any,
    extraDetails: Record<string, any> = {}
  ): HoneycombError {
    // Start building suggestions based on the error and context
    const suggestions: string[] = [];
    
    // Track API-specific validation errors vs general guidance
    const validationErrors: string[] = [];
    const generalGuidance: string[] = [];
    
    // Extract validation errors first (highest priority)
    if (extraDetails.validationErrors && Array.isArray(extraDetails.validationErrors)) {
      extraDetails.validationErrors.forEach((detail: any) => {
        if (detail.description) {
          if (detail.field) {
            validationErrors.push(`Field '${detail.field}': ${detail.description}`);
            suggestions.push(`Fix field '${detail.field}': ${detail.description}`);
          } else {
            validationErrors.push(`${detail.description}`);
            suggestions.push(`${detail.description}`);
          }
        }
      });
    }
    
    // Add specific advice based on the error message
    if (message.includes("time_range") || message.includes("start_time") || message.includes("end_time")) {
      generalGuidance.push("Check your time range parameters - either use time_range OR start_time and end_time together");
    }
    
    if (message.includes("calculations") || message.includes("calculation")) {
      generalGuidance.push("For COUNT operations, DO NOT include a column field");
      generalGuidance.push("For all other operations, a column field is REQUIRED");
    }
    
    // If we have access to the API client, we can provide more specific help
    if (api && typeof api.getEnvironments === 'function') {
      const environments = api.getEnvironments();
      
      // Environment-related suggestions
      if (context.environment) {
        if (!environments.includes(context.environment)) {
          // Environment doesn't exist
          generalGuidance.push(`The environment "${context.environment}" was not found. Available environments: ${environments.join(", ")}`);
        } else {
          // Environment exists, so API key is valid - issue is likely with dataset or query
          if (context.dataset) {
            generalGuidance.push(`Verify the dataset "${context.dataset}" exists in environment "${context.environment}" and you have access to it`);
          }
          generalGuidance.push("Check your query parameters for syntax or logical errors");
        }
      } else {
        // No environment specified
        generalGuidance.push(`Specify a valid environment. Available environments: ${environments.join(", ")}`);
      }
    } else {
      // Without API client, give more generic suggestions
      if (context.environment) {
        generalGuidance.push(`Verify the environment "${context.environment}" is correctly configured`);
      } else {
        generalGuidance.push("Specify a valid environment name");
      }
      
      if (context.dataset) {
        generalGuidance.push(`Verify the dataset "${context.dataset}" exists and you have access to it`);
      }
      
      // Always suggest checking query parameters
      generalGuidance.push("Check that your query parameters follow the required format and constraints");
    }
    
    // Add general guidance to suggestions if we don't have specific validation errors
    if (validationErrors.length === 0) {
      suggestions.push(...generalGuidance);
    }
    
    // Build the final error message with a clearer format
    const baseMessage = `Query validation failed: ${message}`;
    
    // For specific validation errors section
    const validationErrorsText = validationErrors.length > 0 ? 
      `\n\nValidation Errors:\n${validationErrors.map(s => `- ${s}`).join("\n")}` : "";
    
    // For general guidance section (only shown if we have specific errors or if it's the only guidance)
    const generalGuidanceText = (generalGuidance.length > 0 && (validationErrors.length > 0 || validationErrors.length === 0)) ? 
      `\n\nGeneral Guidance:\n${generalGuidance.map(s => `- ${s}`).join("\n")}` : "";
    
    // Create the context metadata but don't include it in the visible message
    const contextMetadata = {
      environment: context.environment,
      dataset: context.dataset,
      api_route: context.api_route
    };
    
    return new HoneycombError(
      422,
      `${baseMessage}${validationErrorsText}${generalGuidanceText}`,
      suggestions,
      { 
        context: contextMetadata,
        validationErrors: extraDetails.validationErrors || [],
        generalGuidance,
        ...extraDetails
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
    // Start with the core message without any validation details
    // (validation details should be part of the message structure, not duplicated here)
    let output = this.message;
    
    // Only add suggestions section if not already included in the message
    // and we have suggestions that aren't just technical context
    const nonContextSuggestions = this.suggestions.filter(s => 
      !s.includes('=') && !s.match(/^[a-z_]+=".+"$/)
    );
    
    if (nonContextSuggestions.length > 0 && !output.includes('Suggested next steps:') && !output.includes('Validation Errors:')) {
      output += "\n\nSuggested next steps:";
      nonContextSuggestions.forEach(suggestion => {
        output += `\n- ${suggestion}`;
      });
    }
    
    // Include error details for debugging if requested
    if (includeDetails && Object.keys(this.details).length > 0) {
      output += "\n\nTechnical details:";
      
      // Handle API-specific error codes if available
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
      
      // Include context information (but more concisely)
      if (this.details.context) {
        const { environment, dataset, api_route } = this.details.context as Record<string, any>;
        if (environment || dataset || api_route) {
          output += "\nContext:";
          if (environment) output += `\n  Environment: ${environment}`;
          if (dataset) output += `\n  Dataset: ${dataset}`;
          if (api_route) output += `\n  API route: ${api_route}`;
        }
      }
      
      // Include any API response details
      if (this.details.statusCode) {
        output += `\nStatus code: ${this.details.statusCode}`;
      }
      
      if (this.details.contentType) {
        output += `\nContent type: ${this.details.contentType}`;
      }
      
      // Include raw response for debugging, but truncate if too large
      if (this.details.rawResponse && includeDetails) {
        try {
          const responseStr = JSON.stringify(this.details.rawResponse);
          const truncated = responseStr.length > 500 ? responseStr.substring(0, 500) + '...' : responseStr;
          output += `\nAPI response: ${truncated}`;
        } catch (e) {
          output += `\nAPI response: [Complex object that could not be stringified]`;
        }
      }
      
      // Include rate limit info
      if (this.details.rateLimit) {
        output += `\nRate limit: ${this.details.rateLimit}`;
      }
      
      // Include validation errors for debugging if they weren't already in the main message
      if (this.details.validationErrors && !output.includes('Validation Errors:')) {
        output += "\nValidation errors:";
        
        // Handle Honeycomb's RFC7807 format with type_detail
        if (Array.isArray(this.details.validationErrors) && 
            this.details.validationErrors.length > 0 &&
            (this.details.validationErrors[0] && 
             (typeof this.details.validationErrors[0] === 'object') &&
             ('code' in this.details.validationErrors[0] || 
              'description' in this.details.validationErrors[0]))) {
          
          // Format specialized for Honeycomb type_detail format
          this.details.validationErrors.forEach((err: any, i: number) => {
            if (err.field && err.description) {
              output += `\n  ${i+1}. Field '${err.field}': ${err.description} (code: ${err.code || 'unknown'})`;
            } else if (err.description) {
              // For validation errors without a field property (like in the example)
              output += `\n  ${i+1}. ${err.description} (code: ${err.code || 'unknown'})`;
            } else {
              // Ensure proper stringification of complex objects
              try {
                output += `\n  ${i+1}. ${JSON.stringify(err, null, 2)}`;
              } catch (stringifyError) {
                // Fallback to simple properties if JSON.stringify fails
                output += `\n  ${i+1}. [Object with properties: ${Object.keys(err).join(', ')}]`;
              }
            }
          });
        } 
        // Handle generic array of validation errors
        else if (Array.isArray(this.details.validationErrors)) {
          this.details.validationErrors.forEach((err: any, i: number) => {
            if (typeof err === 'string') {
              output += `\n  ${i+1}. ${err}`;
            } else if (err && typeof err === 'object') {
              // Handle object validation errors more carefully
              try {
                output += `\n  ${i+1}. ${JSON.stringify(err, null, 2)}`;
              } catch (stringifyError) {
                // Fallback if JSON.stringify fails
                output += `\n  ${i+1}. [Object with properties: ${Object.keys(err).join(', ')}]`;
              }
            } else {
              output += `\n  ${i+1}. ${String(err)}`;
            }
          });
        } 
        // Handle object or other formats
        else {
          try {
            output += `\n  ${JSON.stringify(this.details.validationErrors, null, 2)}`;
          } catch (stringifyError) {
            // Fallback if JSON.stringify fails
            if (typeof this.details.validationErrors === 'object' && this.details.validationErrors !== null) {
              output += `\n  [Object with properties: ${Object.keys(this.details.validationErrors).join(', ')}]`;
            } else {
              output += `\n  ${String(this.details.validationErrors)}`;
            }
          }
        }
      }
      
      // Loop through any other details not already handled
      const handledKeys = ['validationErrors', 'code', 'title', 'detail', 
                           'requestId', 'context', 'statusCode', 'contentType', 
                           'rawResponse', 'rateLimit', 'generalGuidance'];
      
      const otherDetails = Object.entries(this.details)
        .filter(([key]) => !handledKeys.includes(key));
      
      if (otherDetails.length > 0) {
        output += "\n\nAdditional details:";
        otherDetails.forEach(([key, value]) => {
          // For objects or arrays, use JSON stringify with indentation
          if (typeof value === 'object' && value !== null) {
            try {
              output += `\n${key}: ${JSON.stringify(value, null, 2)}`;
            } catch (e) {
              output += `\n${key}: [Complex object that could not be stringified]`;
            }
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
