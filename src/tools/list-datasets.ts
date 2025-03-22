import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Tool to list datasets in a specific environment
 */
export function createListDatasetsTool(api: HoneycombAPI) {
  return {
    name: "list_datasets",
    schema: { environment: z.string() },
    handler: async ({ environment }: { environment: string }) => {
      try {
        const datasets = await api.listDatasets(environment);
        // Simplify the response to reduce context window usage
        const simplifiedDatasets = datasets.map(dataset => ({
          name: dataset.name,
          slug: dataset.slug,
          description: dataset.description || '',
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedDatasets, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "list_datasets");
      }
    }
  };
}
