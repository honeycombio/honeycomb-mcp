import { HoneycombAPI } from "../api/client.js";
import { createDatasetsResource, handleDatasetResource } from "./datasets.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register all resources with the MCP server
 * 
 * @param server - The MCP server instance
 * @param api - The Honeycomb API client
 */
export function registerResources(server: McpServer, api: HoneycombAPI) {
  // Register datasets resource
  server.resource(
    "datasets",
    createDatasetsResource(api),
    (_uri: URL, variables: Record<string, string | string[]>) => 
      handleDatasetResource(api, variables as Record<string, string>)
  );
}
