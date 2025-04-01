import { HoneycombAPI } from "../api/client.js";
import { createListDatasetsTool } from "./list-datasets.js";
import { createGetColumnsTool } from "./get-columns.js";
import { createRunQueryTool } from "./run-query.js";
import { createGetQueryTool } from "./get-query.js";
import { createRunSavedQueryTool } from "./run-saved-query.js";
import { createAnalyzeColumnTool } from "./analyze-column.js";
import { createListBoardsTool } from "./list-boards.js";
import { createGetBoardTool } from "./get-board.js";
import { createListMarkersTool } from "./list-markers.js";
import { createListRecipientsTool } from "./list-recipients.js";
import { createListSLOsTool } from "./list-slos.js";
import { createGetSLOTool } from "./get-slo.js";
import { createListTriggersTool } from "./list-triggers.js";
import { createGetTriggerTool } from "./get-trigger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Register all tools with the MCP server
 * 
 * @param server - The MCP server instance
 * @param api - The Honeycomb API client
 */
export function registerTools(server: McpServer, api: HoneycombAPI) {
  const tools = [
    // Dataset tools
    createListDatasetsTool(api),
    createGetColumnsTool(api),

    // Query tools
    createRunQueryTool(api),
    createGetQueryTool(api),
    createRunSavedQueryTool(api),
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
    // Convert the schema from a plain object to a zod object
    const zodSchema = z.object(tool.schema);
    
    // Register the tool with the server using type assertion to bypass TypeScript's strict type checking
    (server as any).tool(
      tool.name,
      tool.description,
      zodSchema.shape,
      async (args: Record<string, any>, extra: any) => {
        try {
          // Validate and ensure required fields are present before passing to handler
          if (tool.name.includes("analyze_column") && (!args.environment || !args.dataset || !args.column)) {
            throw new Error("Missing required fields: environment, dataset, and column are required");
          } else if (tool.name.includes("run_query") && (!args.environment || !args.dataset)) {
            throw new Error("Missing required fields: environment and dataset are required");
          } else if (!args.environment) {
            throw new Error("Missing required field: environment is required");
          }
          
          // Use type assertion to satisfy TypeScript's type checking
          const result = await tool.handler(args as any);
          
          // If the result already has the expected format, return it directly
          if (result && typeof result === 'object' && 'content' in result) {
            return result as any;
          }
          
          // Otherwise, format the result as expected by the SDK
          return {
            content: [
              {
                type: "text",
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            ],
          } as any;
        } catch (error) {
          // Format errors to match the SDK's expected format
          // Use handleToolError directly since it's no longer async
          return handleToolError(error, tool.name);
        }
      }
    );
  }
}
