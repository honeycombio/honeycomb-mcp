import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { DatasetArgumentsSchema } from "../types/schema.js";

/**
 * Interface for simplified SLO data returned by the list_slos tool
 */
interface SimplifiedSLO {
  id: string;
  name: string;
  description: string;
  time_period_days: number;
  target_per_million: number;
}

/**
 * Tool to list SLOs (Service Level Objectives) for a specific dataset
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListSLOsTool(api: HoneycombAPI) {
  return {
    name: "list_slos",
    schema: {
      environment: z.string().describe("The Honeycomb environment"),
      dataset: z.string().describe("The dataset to fetch SLOs from"),
    },
    /**
     * Handler for the list_slos tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset to fetch SLOs from
     * @returns Simplified list of SLOs with relevant metadata
     */
    handler: async ({ environment, dataset }: z.infer<typeof DatasetArgumentsSchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_slos");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "list_slos");
      }

      try {
        // Fetch SLOs from the API
        const slos = await api.getSLOs(environment, dataset);
        
        // Simplify the response to reduce context window usage
        const simplifiedSLOs: SimplifiedSLO[] = slos.map(slo => ({
          id: slo.id,
          name: slo.name,
          description: slo.description || '',
          time_period_days: slo.time_period_days,
          target_per_million: slo.target_per_million,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedSLOs, null, 2),
            },
          ],
          metadata: {
            count: simplifiedSLOs.length,
            dataset,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "list_slos");
      }
    }
  };
}
