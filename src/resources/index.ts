import { HoneycombAPI } from "../api/client.js";
import { createDatasetsResource, handleDatasetResource } from "./datasets.js";
import { MCPServer } from "../types/mcp.js";

/**
 * Register all resources with the MCP server
 * 
 * @param server - The MCP server instance
 * @param api - The Honeycomb API client
 */
export function registerResources(server: MCPServer, api: HoneycombAPI) {
  // Register datasets resource
  // Use type assertion to make TypeScript happy with the MCP SDK
  (server as any).resource(
    "datasets",
    createDatasetsResource(api),
    (uri: URL, params: { environment: string; dataset: string }) => 
      handleDatasetResource(api, uri, params)
  );
}
