import { HoneycombAPI } from "../api/client.js";
import { createListDatasetsTool } from "./list-datasets.js";
import { createGetColumnsTool } from "./get-columns.js";
import { createRunQueryTool } from "./run-query.js";
import { createAnalyzeColumnTool } from "./analyze-column.js";
import { createListBoardsTool } from "./list-boards.js";
import { createGetBoardTool } from "./get-board.js";
import { createListMarkersTool } from "./list-markers.js";
import { createListRecipientsTool } from "./list-recipients.js";
import { createListSLOsTool } from "./list-slos.js";
import { createGetSLOTool } from "./get-slo.js";
import { createListTriggersTool } from "./list-triggers.js";
import { createGetTriggerTool } from "./get-trigger.js";
import { MCPServer } from "../types/mcp.js";

/**
 * Register all tools with the MCP server
 * 
 * @param server - The MCP server instance
 * @param api - The Honeycomb API client
 */
export function registerTools(server: MCPServer, api: HoneycombAPI) {
  const tools = [
    // Dataset tools
    createListDatasetsTool(api),
    createGetColumnsTool(api),

    // Query tools
    createRunQueryTool(api),
    createAnalyzeColumnTool(api),

    // Board tools
    createListBoardsTool(api),
    createGetBoardTool(api),

    // Marker tools
    createListMarkersTool(api),

    // Recipient tools
    createListRecipientsTool(api),

    // SLO tools
    createListSLOsTool(api),
    createGetSLOTool(api),

    // Trigger tools
    createListTriggersTool(api),
    createGetTriggerTool(api)
  ];

  // Register each tool with the server
  for (const tool of tools) {
    // Use type assertion to make TypeScript happy with the MCP SDK
    (server as any).tool(
      tool.name,
      tool.schema,
      tool.handler
    );
  }
}
