import { HoneycombAPI } from "../api/client.js";
import { CollectionOptions } from "../types/api.js";
import { ListDatasetsSchema } from "../types/resource-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";

/**
 * Creates a tool for listing datasets in a Honeycomb environment
 * 
 * This tool returns a list of all datasets available in the specified environment,
 * including their names, slugs, and descriptions. It supports pagination, sorting,
 * and text search capabilities.
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createListDatasetsTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_datasets",
    description: "Lists available datasets for the active environment with pagination, sorting, and search support. Returns dataset names, slugs, descriptions, and timestamps.",
    schema: ListDatasetsSchema,
    
    handler: async (params: { environment: string } & CollectionOptions, api) => {
      // Validate required parameters
      if (!params.environment) {
        throw new Error("Missing required parameter: environment");
      }

      // Fetch datasets from the API
      const datasets = await api.listDatasets(params.environment);
      
      // Simplify the datasets to reduce context window usage
      const simplifiedDatasets = datasets.map(dataset => ({
        name: dataset.name,
        slug: dataset.slug,
        description: dataset.description || '',
        created_at: dataset.created_at,
        last_written_at: dataset.last_written_at,
      }));
      
      // Use the shared collection handler to handle pagination, filtering, etc.
      return handleCollection(
        params.environment,
        'dataset',
        simplifiedDatasets,
        params,
        ['name', 'slug', 'description']
      );
    },
    
    errorContext: (params) => ({
      environment: params.environment
    })
  });
}