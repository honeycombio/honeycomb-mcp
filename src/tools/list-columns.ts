import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { ListColumnsSchema } from "../types/collection-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";
import { getCache } from "../cache/index.js";

/**
 * Interface for simplified column data returned by the list_columns tool
 */
interface SimplifiedColumn {
  name: string;
  type: string;
  description: string;
  hidden: boolean;
  last_written?: string | null;
  created_at: string;
}

/**
 * Tool to list columns for a specific dataset. This tool returns a list of all columns available 
 * in the specified dataset, including their names, types, descriptions, and hidden status,
 * with support for pagination, sorting, and filtering.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListColumnsTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_columns",
    description: "Lists all columns available in the specified dataset, including their names, types, descriptions, and hidden status. Supports pagination, sorting by type/name/created_at, and searching by name/description. Note: __all__ is NOT supported as a dataset name.",
    schema: ListColumnsSchema,
    
    handler: async (params: z.infer<typeof ListColumnsSchema>, api) => {
      const { environment, dataset } = params;
      
      // Validate input parameters
      if (!environment) {
        throw new Error("environment parameter is required");
      }
      if (!dataset) {
        throw new Error("dataset parameter is required");
      }

      // Fetch columns from the API
      const columns = await api.getVisibleColumns(environment, dataset);
      
      // Simplify the response to reduce context window usage
      const simplifiedColumns: SimplifiedColumn[] = columns.map(column => ({
        name: column.key_name,
        type: column.type,
        description: column.description || '',
        hidden: column.hidden || false,
        last_written: column.last_written || null,
        created_at: column.created_at,
      }));
      
      // Special cache handling for columns - they need a specific cache key
      const cache = getCache();
      const cacheKey = `${dataset}:columns`;
      
      // Ensure the columns are in the cache
      cache.set(environment, 'column', simplifiedColumns, cacheKey);
      
      // Use the shared collection handler with the columns-specific cache key
      return handleCollection(
        environment,
        'column',
        simplifiedColumns,
        params,
        ['name', 'description', 'type'],
        cacheKey  // Pass the cache key
      );
    },
    
    errorContext: (params) => ({
      environment: params.environment,
      dataset: params.dataset
    })
  });
}