/**
 * Tool factory for creating standardized tool definitions
 */
import { z } from "zod";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { handleToolError } from "./tool-error.js";
import { HoneycombAPI } from "../api/client.js";

/**
 * Type for tool response content - success case
 */
export interface ToolSuccessResponse {
  content: { type: string; text: string; }[];
}

/**
 * Type for tool response content - error case
 */
export interface ToolErrorResponse {
  isError: true;
  content: { type: string; text: string; }[];
}

/**
 * Type for tool response content (either success or error)
 */
export type ToolResponseContent = ToolSuccessResponse | ToolErrorResponse;

/**
 * Type for tool definition following MCP specification
 */
export interface Tool<TParams> {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (params: TParams) => Promise<ToolResponseContent>;
}

/**
 * Options for creating a tool
 */
export interface ToolOptions<TParams> {
  name: string;
  description: string;
  schema: Record<string, any> | z.ZodType<TParams>;
  handler: (
    params: TParams, 
    api: HoneycombAPI
  ) => Promise<ToolResponseContent>;
  errorContext?: (params: TParams) => Record<string, any>;
}

/**
 * Factory function for creating standardized tools
 * 
 * This function centralizes the creation of tools to ensure consistent
 * structure, error handling, and response formatting.
 * 
 * @param api - The Honeycomb API client
 * @param options - Tool creation options
 * @returns A configured tool object
 */
export function createTool<TParams>(
  api: HoneycombAPI,
  options: ToolOptions<TParams>
): Tool<TParams> {
  // Convert schema to proper JSON Schema format
  let inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };

  if (options.schema instanceof z.ZodType) {
    // Use zod-to-json-schema to convert Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(options.schema, { 
      target: 'jsonSchema7',
      errorMessages: true,
    }) as any;
    
    // Ensure the schema follows MCP specification
    inputSchema = {
      type: "object",
      properties: jsonSchema.properties || {},
      required: jsonSchema.required || []
    };
  } else {
    // Direct JSON schema object
    inputSchema = {
      type: "object",
      properties: options.schema.properties || {},
      required: options.schema.required || []
    };
  }
  
  return {
    name: options.name,
    description: options.description,
    // Use properly formatted JSON Schema that follows MCP specification
    inputSchema,
    
    handler: async (params: TParams) => {
      try {
        return await options.handler(params, api);
      } catch (error) {
        // Use optional error context if provided
        const context = options.errorContext ? 
          { ...options.errorContext(params), api } : 
          { api };
        
        // The handleToolError function returns a properly formatted error response
        return handleToolError(error, options.name, context);
      }
    }
  };
}