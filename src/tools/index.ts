import { HoneycombAPI } from "../api/client.js";
import { createListDatasetsTool } from "./list-datasets.js";
import { createGetColumnsTool } from "./get-columns.js";
import { createRunQueryTool } from "./run-query.js";
import { createAnalyzeColumnTool } from "./analyze-column.js";
import { createListSLOsTool } from "./list-slos.js";
import { createGetSLOTool } from "./get-slo.js";
import { createListTriggersTool } from "./list-triggers.js";
import { createGetTriggerTool } from "./get-trigger.js";

/**
 * Register all tools with the MCP server
 * @param server The MCP server instance
 * @param api The Honeycomb API client
 */
export function registerTools(server: any, api: HoneycombAPI) {
  const tools = [
    createListDatasetsTool(api),
    createGetColumnsTool(api),
    createRunQueryTool(api),
    createAnalyzeColumnTool(api),
    createListSLOsTool(api),
    createGetSLOTool(api),
    createListTriggersTool(api),
    createGetTriggerTool(api)
  ];

  // Register each tool with the server
  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.schema,
      tool.handler
    );
  }
}
