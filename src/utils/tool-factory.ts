/**
 * Tool factory for creating standardized tool definitions
 */
import { z } from "zod";
import { handleToolError } from "./tool-error.js";
import { HoneycombAPI } from "../api/client.js";

/**
 * Type for tool response content
 */
export interface ToolResponseContent {
  content: { type: string; text: string; }[];
  error?: {
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Type for tool definition
 */
export interface Tool<TParams> {
  name: string;
  description: string;
  schema: Record<string, any>;
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
  return {
    name: options.name,
    description: options.description,
    // Handle both Zod type schemas and regular object schemas
    schema: options.schema instanceof z.ZodType ? (options.schema as any).shape || options.schema : options.schema,
    
    handler: async (params: TParams) => {
      try {
        return await options.handler(params, api);
      } catch (error) {
        // Use optional error context if provided
        const context = options.errorContext ? 
          { ...options.errorContext(params), api } : 
          { api };
        return handleToolError(error, options.name, context);
      }
    }
  };
}