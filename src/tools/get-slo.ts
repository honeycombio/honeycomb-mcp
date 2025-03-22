import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Tool to get a specific SLO by ID
 */
export function createGetSLOTool(api: HoneycombAPI) {
  return {
    name: "get_slo",
    schema: {
      environment: z.string(),
      dataset: z.string(),
      sloId: z.string(),
    },
    handler: async ({ environment, dataset, sloId }: { environment: string; dataset: string; sloId: string }) => {
      try {
        const slo = await api.getSLO(environment, dataset, sloId);
        // Simplify the response to reduce context window usage
        const simplifiedSLO = {
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
        };
      } catch (error) {
        return handleToolError(error, "get_slo");
      }
    }
  };
}
