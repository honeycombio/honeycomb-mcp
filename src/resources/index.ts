import { HoneycombAPI } from "../api/client.js";
import { createDatasetsResource, handleDatasetResource } from "./datasets.js";

/**
 * Register all resources with the MCP server
 * @param server The MCP server instance
 * @param api The Honeycomb API client
 */
export function registerResources(server: any, api: HoneycombAPI) {
  // Register datasets resource
  server.resource(
    "datasets",
    createDatasetsResource(api),
    (uri: URL, params: { environment: string; dataset: string }) => 
      handleDatasetResource(api, uri, params)
  );
}
