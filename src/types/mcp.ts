/**
 * Interface for MCP server types and interactions
 */

/**
 * Handler function type for resource handlers
 */
export type ResourceHandlerFunction = (uri: URL, params: Record<string, any>) => Promise<any>;

/**
 * Factory function type for resource factories
 */
export type ResourceFactoryFunction = (...args: any[]) => any;

/**
 * Response content item for MCP tools
 */
export interface MCPToolResponseContent {
  type: 'text' | 'image' | 'video' | 'audio';
  text: string;
}

/**
 * Standard response format for MCP tool handlers
 */
export interface MCPToolResponse {
  content: MCPToolResponseContent[];
  metadata?: Record<string, any>;
}

/**
 * Handler function type for tool handlers
 */
export type ToolHandlerFunction = (params: Record<string, any>) => Promise<MCPToolResponse>;

/**
 * Schema definition type for tools
 */
export type ToolSchemaDefinition = Record<string, any>;

/**
 * Interface for MCP Server to register resources and tools
 */
export interface MCPServer {
  /**
   * Register a resource with the MCP server
   * 
   * @param name - The name of the resource
   * @param factory - The resource factory function
   * @param handler - The resource handler function
   */
  resource(
    name: string, 
    factory: ResourceFactoryFunction, 
    handler: ResourceHandlerFunction
  ): void;

  /**
   * Register a tool with the MCP server
   * 
   * @param name - The name of the tool
   * @param schema - The schema definition for the tool
   * @param handler - The tool handler function
   */
  tool(
    name: string, 
    schema: ToolSchemaDefinition, 
    handler: ToolHandlerFunction
  ): void;
}

/**
 * Type-safe handler function for tool handlers
 */
export type TypedToolHandlerFunction<T extends Record<string, any>> = 
  (params: T) => Promise<MCPToolResponse>;

/**
 * Interface for MCP tool definition
 */
export interface MCPTool {
  name: string;
  schema: ToolSchemaDefinition;
  handler: ToolHandlerFunction;
}

/**
 * Interface for a type-safe MCP tool definition
 */
export interface TypedMCPTool<T extends Record<string, any>> {
  name: string;
  schema: ToolSchemaDefinition;
  handler: TypedToolHandlerFunction<T>;
}