import { HoneycombAPI } from "../api/client.js";
import { createListDatasetsTool } from "./list-datasets.js";
import { createListColumnsTool } from "./list-columns.js";
import { createRunQueryTool } from "./run-query.js";
import { createAnalyzeColumnsTool } from "./analyze-columns.js";
import { createListBoardsTool } from "./list-boards.js";
import { createGetBoardTool } from "./get-board.js";
import { createListMarkersTool } from "./list-markers.js";
import { createListRecipientsTool } from "./list-recipients.js";
import { createListSLOsTool } from "./list-slos.js";
import { createGetSLOTool } from "./get-slo.js";
import { createListTriggersTool } from "./list-triggers.js";
import { createGetTriggerTool } from "./get-trigger.js";
import { createTraceDeepLinkTool } from "./get-trace-link.js";
import { createInstrumentationGuidanceTool } from "./instrumentation-guidance.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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
    createListColumnsTool(api),

    // Query tools
    createRunQueryTool(api),
    createAnalyzeColumnsTool(api),

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
    createGetTriggerTool(api),
    
    // Trace tools
    createTraceDeepLinkTool(api),
    
    // Instrumentation tools
    createInstrumentationGuidanceTool(api)
  ];

  // Register each tool with the server
  for (const tool of tools) {
    // Register the tool with the server using type assertion to bypass TypeScript's strict type checking
    (server as any).tool(
      tool.name,
      tool.description,
      tool.schema, 
      async (args: Record<string, any>, extra: any) => {
        try {
          // Validate and ensure required fields are present before passing to handler
          if (tool.name.includes("analyze_columns") && (!args.environment || !args.dataset || !args.columns)) {
            throw new Error("Missing required fields: environment, dataset, and columns are required");
          } else if (tool.name.includes("run_query") && (!args.environment || !args.dataset)) {
            throw new Error("Missing required fields: environment and dataset are required");
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
          return {
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : String(error),
              },
            ],
            isError: true,
          } as any;
        }
      }
    );
  }
}
