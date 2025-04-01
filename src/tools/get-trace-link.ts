import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { TraceDeepLinkSchema } from "../types/schema.js";

/**
 * Creates a deep link to a Honeycomb trace that can be opened in the Honeycomb UI
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createTraceDeepLinkTool(api: HoneycombAPI) {
  return {
    name: "get_trace_link",
    description: "Generates a direct deep link to a specific trace in the Honeycomb UI. This tool creates a URL that opens a specific distributed trace, optionally positioning to a particular span and time range.",
    schema: TraceDeepLinkSchema.shape,
    /**
     * Handler for the get_trace_link tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset containing the trace
     * @param params.traceId - The unique trace ID
     * @param params.spanId - The unique span ID to jump to within the trace
     * @param params.traceStartTs - Start timestamp in Unix epoch seconds
     * @param params.traceEndTs - End timestamp in Unix epoch seconds
     * @returns A deep link to the specified trace in the Honeycomb UI
     */
    handler: async ({ 
      environment, 
      dataset, 
      traceId, 
      spanId,
      traceStartTs,
      traceEndTs 
    }: z.infer<typeof TraceDeepLinkSchema>) => {
      try {
        // Input validation
        if (!environment) {
          return handleToolError(new Error("environment parameter is required"), "get_trace_link");
        }
        if (!dataset) {
          return handleToolError(new Error("dataset parameter is required"), "get_trace_link");
        }
        if (!traceId) {
          return handleToolError(new Error("traceId parameter is required"), "get_trace_link");
        }
        
        try {
          // Get auth info to find the team information
          const authInfo = await api.getAuthInfo(environment);
          
          if (!authInfo.team || !authInfo.team.slug) {
            throw new Error(`Could not determine team slug for environment "${environment}"`);
          }
          
          const teamSlug = authInfo.team.slug;
          
          // Base URL for the trace
          let url = `https://ui.honeycomb.io/${teamSlug}/datasets/${dataset}/trace?trace_id=${encodeURIComponent(traceId)}`;
          
          // Add optional parameters if provided
          if (spanId) {
            url += `&span_id=${encodeURIComponent(spanId)}`;
          }
          
          if (traceStartTs) {
            url += `&trace_start_ts=${traceStartTs}`;
          }
          
          if (traceEndTs) {
            url += `&trace_end_ts=${traceEndTs}`;
          }
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  trace_url: url,
                  trace_id: traceId,
                  environment,
                  dataset
                }, null, 2),
              },
            ],
          };
        } catch (error) {
          return handleToolError(error, "get_trace_link");
        }
      } catch (error) {
        return handleToolError(error, "get_trace_link");
      }
    }
  };
}