import { HoneycombAPI } from "../api/client.js";
import { createDatasetsResource, handleDatasetResource } from "./datasets.js";
import { createSLOsResource, handleSLOResource } from "./slos.js";
import { createBoardsResource, handleBoardResource } from "./boards.js";
import { createQueriesResource, handleQueryResource } from "./queries.js";
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
  
  // Register SLOs resource
  server.resource(
    "slos",
    createSLOsResource(api),
    (_uri: URL, variables: Record<string, string | string[]>) => 
      handleSLOResource(api, variables as Record<string, string>)
  );
  
  // Register boards resource
  server.resource(
    "boards",
    createBoardsResource(api),
    (_uri: URL, variables: Record<string, string | string[]>) => 
      handleBoardResource(api, variables as Record<string, string>)
  );
  
  // Register queries resource
  server.resource(
    "queries",
    createQueriesResource(api),
    (_uri: URL, variables: Record<string, string | string[]>) => 
      handleQueryResource(api, variables)
  );
}
