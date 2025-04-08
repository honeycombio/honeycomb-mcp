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
  inputSchema: Record<string, any>; // JSON Schema object
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
  // Convert Zod schema to JSON Schema directly using zodToJsonSchema
  const inputSchema = options.schema instanceof z.ZodType 
    ? zodToJsonSchema(options.schema, {
        // Target JSONSchema7 for MCP compatibility
        target: 'jsonSchema7',
        // Include error messages from Zod validation
        errorMessages: true,
      })
    : options.schema;
  
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