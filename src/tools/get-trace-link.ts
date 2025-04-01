import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { TraceDeepLinkSchema } from "../types/schema.js";

/**
 * Tool to generate a deep link to a specific trace in the Honeycomb UI. This tool returns a URL that can be used to directly access a trace, optionally highlighting a specific span and limiting the time range.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createTraceDeepLinkTool(api: HoneycombAPI) {
  return {
    name: "get_trace_link",
    description: "Generates a direct deep link to a specific trace in the Honeycomb UI. This tool creates a URL that opens a specific distributed trace, optionally positioning to a particular span and time range. If no time range is specified, the trace must have been generated within two hours from the current time. If only the start time is provided, the end time is assumed to be 10 minutes from the start time.",
    schema: TraceDeepLinkSchema.shape,
    /**
     * Handler for the get_trace_link tool
     * 
     * @param params - The parameters for the tool
     * @returns A URL for direct access to the trace in the Honeycomb UI
     */
    handler: async (params: z.infer<typeof TraceDeepLinkSchema>) => {
      try {
        // Validate required parameters
        if (!params.environment) {
          throw new Error("Missing required parameter: environment");
        }
        if (!params.dataset) {
          throw new Error("Missing required parameter: dataset");
        }
        if (!params.traceId) {
          throw new Error("Missing required parameter: traceId");
        }

        // Get the team slug for the environment
        const teamSlug = await api.getTeamSlug(params.environment);
        
        // Start building the trace URL
        let traceUrl = `https://ui.honeycomb.io/${teamSlug}/environments/${params.environment}/trace?trace_id=${encodeURIComponent(params.traceId)}`;
        
        // Add optional parameters if provided
        if (params.spanId) {
          traceUrl += `&span=${encodeURIComponent(params.spanId)}`;
        }
        
        if (params.traceStartTs) {
          traceUrl += `&trace_start_ts=${params.traceStartTs}`;
        }
        
        if (params.traceEndTs) {
          traceUrl += `&trace_end_ts=${params.traceEndTs}`;
        }
        
        // Add dataset parameter for more specific context
        if (params.dataset) {
          // Insert the dataset before the trace part in the URL
          traceUrl = traceUrl.replace(
            `/trace?`,
            `/datasets/${encodeURIComponent(params.dataset)}/trace?`
          );
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                url: traceUrl,
                environment: params.environment,
                dataset: params.dataset,
                traceId: params.traceId,
                team: teamSlug
              }, null, 2),
            },
          ],
          metadata: {
            environment: params.environment,
            dataset: params.dataset,
            traceId: params.traceId,
            team: teamSlug
          }
        };
      } catch (error) {
        return handleToolError(error, "get_trace_link");
      }
    }
  };
}