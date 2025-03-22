import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Interface for simplified SLO data returned by the get_slo tool
 */
interface SimplifiedSLODetails {
  id: string;
  name: string;
  description: string;
  time_period_days: number;
  target_per_million: number;
  compliance: number;
  budget_remaining: number;
  sli: string | undefined;
  created_at: string;
  updated_at: string;
}

/**
 * Tool to get a specific SLO (Service Level Objective) by ID with detailed information
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetSLOTool(api: HoneycombAPI) {
  return {
    name: "get_slo",
    schema: {
      environment: z.string().describe("The Honeycomb environment"),
      dataset: z.string().describe("The dataset containing the SLO"),
      sloId: z.string().describe("The ID of the SLO to retrieve"),
    },
    /**
     * Handler for the get_slo tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset containing the SLO
     * @param params.sloId - The ID of the SLO to retrieve
     * @returns Detailed information about the specified SLO
     */
    handler: async ({ environment, dataset, sloId }: { environment: string; dataset: string; sloId: string }) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "get_slo");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "get_slo");
      }
      if (!sloId) {
        return handleToolError(new Error("sloId parameter is required"), "get_slo");
      }

      try {
        // Fetch SLO details from the API
        const slo = await api.getSLO(environment, dataset, sloId);
        
        // Simplify the response to reduce context window usage
        const simplifiedSLO: SimplifiedSLODetails = {
          id: slo.id,
          name: slo.name,
          description: slo.description || '',
          time_period_days: slo.time_period_days,
          target_per_million: slo.target_per_million,
          compliance: slo.compliance,
          budget_remaining: slo.budget_remaining,
          sli: slo.sli?.alias,
          created_at: slo.created_at,
          updated_at: slo.updated_at,
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedSLO, null, 2),
            },
          ],
          metadata: {
            sloId,
            dataset,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "get_slo");
      }
    }
  };
}
