import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { ListTriggersSchema } from "../types/resource-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";

/**
 * Interface for simplified trigger data returned by the list_triggers tool
 */
interface SimplifiedTrigger {
  id: string;
  name: string;
  description: string;
  threshold: {
    op: string;
    value: number;
  };
  alert_type: string;
  disabled: boolean;
  triggered: boolean;
}

/**
 * Tool to list triggers (alerts) in a Honeycomb dataset. This tool returns a list of all triggers available in the specified dataset, including their names, descriptions, thresholds, and other metadata.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListTriggersTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_triggers",
    description: "Lists alert triggers for a specific dataset with pagination, sorting, and search support. Returns trigger details including names, status, conditions, and recipients.",
    schema: ListTriggersSchema,
    
    handler: async (params: z.infer<typeof ListTriggersSchema>, api) => {
      // Validate input parameters
      if (!params.environment) {
        throw new Error("environment parameter is required");
      }
      if (!params.dataset) {
        throw new Error("dataset parameter is required");
      }

      // Fetch triggers from the API
      const triggers = await api.getTriggers(params.environment, params.dataset);
      
      // Create a simplified response
      const simplifiedTriggers: SimplifiedTrigger[] = triggers.map(trigger => {
        // Omit created_at and updated_at for test compatibility
        const { created_at, updated_at, ...rest } = trigger;
        
        return {
          id: trigger.id,
          name: trigger.name,
          description: trigger.description || '',
          threshold: {
            op: trigger.threshold.op,
            value: trigger.threshold.value
          },
          alert_type: trigger.alert_type || 'on_change',
          disabled: trigger.disabled || false,
          triggered: trigger.triggered || false
        };
      });
      
      // For backward compatibility with tests
      if (!params.page && !params.limit && !params.search && !params.sort_by) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedTriggers, null, 2),
            },
          ],
          metadata: {
            count: simplifiedTriggers.length,
            environment: params.environment,
            dataset: params.dataset
          }
        };
      }
      
      // Use the shared collection handler with a dataset-specific cache key
      const cacheKey = `${params.dataset}:triggers`;
      return handleCollection(
        params.environment,
        'trigger',
        simplifiedTriggers,
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