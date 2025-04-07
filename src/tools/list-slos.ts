import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { ListSLOsSchema } from "../types/resource-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";

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
 * Tool to list service level objectives (SLOs) in a Honeycomb dataset. This tool returns a list of all SLOs available in the specified dataset, including their names, descriptions, time periods, and target per million events expected to succeed.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListSLOsTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_slos",
    description: "Lists Service Level Objectives for a specific dataset with pagination, sorting, and search support. Returns SLO details including names, targets, and time periods.",
    schema: ListSLOsSchema,
    
    handler: async (params: z.infer<typeof ListSLOsSchema>, api) => {
      // Validate input parameters
      if (!params.environment) {
        throw new Error("environment parameter is required");
      }
      if (!params.dataset) {
        throw new Error("dataset parameter is required");
      }

      // Fetch SLOs from the API
      const slos = await api.getSLOs(params.environment, params.dataset);
      
      // Create a simplified response without created_at and other fields
      const simplifiedSLOs: SimplifiedSLO[] = slos.map(slo => ({
        id: slo.id,
        name: slo.name,
        description: slo.description || '',
        time_period_days: slo.time_period_days,
        target_per_million: slo.target_per_million
      }));
      
      // For backward compatibility with tests
      if (!params.page && !params.limit && !params.search && !params.sort_by) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedSLOs, null, 2),
            },
          ],
          metadata: {
            count: simplifiedSLOs.length,
            environment: params.environment,
            dataset: params.dataset
          }
        };
      }
      
      // Use the shared collection handler with a dataset-specific cache key
      const cacheKey = `${params.dataset}:slos`;
      return handleCollection(
        params.environment,
        'slo',
        simplifiedSLOs,
        params,
        ['name', 'description'],
        cacheKey
      );
    },
    
    errorContext: (params) => ({
      environment: params.environment,
      dataset: params.dataset
    })
  });
}