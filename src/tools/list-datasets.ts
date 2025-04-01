import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Schema for the list_datasets tool parameters
 */
const ListDatasetsSchema = z.object({
  environment: z.string().min(1, "Environment name cannot be empty")
});

/**
 * Creates a tool for listing datasets in a Honeycomb environment
 * 
 * This tool returns a list of all datasets available in the specified environment,
 * including their names, slugs, and descriptions.
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createListDatasetsTool(api: HoneycombAPI) {
  return {
    name: "list_datasets",
    description: "Lists available datasets for the active environment. This tool returns a list of all datasets available in the specified environment, including their names, slugs, and descriptions.",
    schema: { environment: z.string() },
    /**
     * Handles the list_datasets tool request
     * 
     * @param params - The parameters containing the environment name
     * @returns A formatted response with the list of datasets
     */
    handler: async (params: { environment: string }) => {
      try {
        // Validate required parameters
        if (!params.environment) {
          throw new Error("Missing required parameter: environment");
        }

        // Fetch datasets from the API
        const datasets = await api.listDatasets(params.environment);
        
        // Simplify the response to reduce context window usage
        const simplifiedDatasets = datasets.map(dataset => ({
          name: dataset.name,
          slug: dataset.slug,
          description: dataset.description || '',
          created_at: dataset.created_at,
          last_written_at: dataset.last_written_at,
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
