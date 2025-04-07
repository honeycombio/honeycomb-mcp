import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { TraceDeepLinkSchema } from "../types/collection-schemas.js";
import { createTool } from "../utils/tool-factory.js";

/**
 * Tool to generate a deep link to a specific trace in the Honeycomb UI. This tool returns a URL that can be used to directly access a trace, optionally highlighting a specific span and limiting the time range.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createTraceDeepLinkTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "get_trace_link",
    description: "Generates a direct deep link to a specific trace in the Honeycomb UI. This tool creates a URL that opens a specific distributed trace, optionally positioning to a particular span and time range.",
    schema: TraceDeepLinkSchema,
    
    /**
     * Handler for the get_trace_link tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset containing the trace
     * @param params.traceId - The unique trace ID
     * @param params.spanId - Optional unique span ID
     * @param params.traceStartTs - Optional start timestamp
     * @param params.traceEndTs - Optional end timestamp
     * @returns A URL to the trace in the Honeycomb UI
     */
    handler: async (params: z.infer<typeof TraceDeepLinkSchema>, api) => {
      // Extract parameters
      const { environment, dataset, traceId, spanId, traceStartTs, traceEndTs } = params;
      
      // Validate required parameters
      if (!environment) {
        throw new Error("Missing required parameter: environment");
      }
      if (!dataset) {
        throw new Error("Missing required parameter: dataset");
      }
      if (!traceId) {
        throw new Error("Missing required parameter: traceId");
      }
      
      // Get the team slug
      const teamSlug = await api.getTeamSlug(environment);
      
      // Construct the base URL
      let url = `https://ui.honeycomb.io/${encodeURIComponent(teamSlug)}/environments/${encodeURIComponent(environment)}/datasets/${encodeURIComponent(dataset)}/trace?trace_id=${encodeURIComponent(traceId)}`;
      
      // Add optional parameters if provided
      if (spanId) {
        url += `&span=${encodeURIComponent(spanId)}`;
      }
      if (traceStartTs) {
        url += `&trace_start_ts=${traceStartTs}`;
      }
      if (traceEndTs) {
        url += `&trace_end_ts=${traceEndTs}`;
      }
      
      // Return the URL
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url,
              environment,
              dataset,
              traceId,
              team: teamSlug,
              ...(spanId && { spanId }),
              ...(traceStartTs && { traceStartTs }),
              ...(traceEndTs && { traceEndTs })
            }, null, 2),
          },
        ],
      };
    },
    
    errorContext: (params) => ({
      environment: params.environment,
      dataset: params.dataset,
      traceId: params.traceId
    })
  });
}