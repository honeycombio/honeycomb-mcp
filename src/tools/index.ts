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
          // All validation should now be handled in each tool's handler
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
          // Most errors should be handled by the tool itself through handleToolError,
          // but if one gets through, use a consistent format that matches our enhanced error handling
          
          // Get more useful error details when possible
          const errorDetails = error instanceof Error ? {
            name: error.name,
            stack: error.stack
          } : {};
          
          return {
            content: [
              {
                type: "text",
                text: `Unexpected error in tool execution: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            error: {
              message: error instanceof Error ? error.message : String(error),
              details: errorDetails
            }
          } as any;
        }
      }
    );
  }
}