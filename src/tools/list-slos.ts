import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { DatasetArgumentsSchema } from "../types/schema.js";

/**
 * Tool to list SLOs for a specific dataset
 */
export function createListSLOsTool(api: HoneycombAPI) {
  return {
    name: "list_slos",
    schema: DatasetArgumentsSchema.shape,
    handler: async ({ environment, dataset }: z.infer<typeof DatasetArgumentsSchema>) => {
      try {
        const slos = await api.getSLOs(environment, dataset);
        // Simplify the response to reduce context window usage
        const simplifiedSLOs = slos.map(slo => ({
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
        };
      } catch (error) {
        return handleToolError(error, "list_slos");
      }
    }
  };
}
