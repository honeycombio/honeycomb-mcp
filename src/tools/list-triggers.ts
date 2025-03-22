import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { DatasetArgumentsSchema } from "../types/schema.js";
import { TriggerThreshold } from "../types/trigger.js";

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
  triggered: boolean;
  disabled: boolean;
  frequency: number;
  alert_type?: string;
}

/**
 * Tool to list triggers (alerts) for a specific dataset
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListTriggersTool(api: HoneycombAPI) {
  return {
    name: "list_triggers",
    schema: {
      environment: z.string().describe("The Honeycomb environment"),
      dataset: z.string().describe("The dataset to fetch triggers from"),
    },
    /**
     * Handler for the list_triggers tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset to fetch triggers from
     * @returns Simplified list of triggers with relevant metadata
     */
    handler: async ({ environment, dataset }: z.infer<typeof DatasetArgumentsSchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_triggers");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "list_triggers");
      }

      try {
        // Fetch triggers from the API
        const triggers = await api.getTriggers(environment, dataset);
        
        // Simplify the response to reduce context window usage
        const simplifiedTriggers: SimplifiedTrigger[] = triggers.map(trigger => ({
          id: trigger.id,
          name: trigger.name,
          description: trigger.description || '',
          threshold: {
            op: trigger.threshold.op,
            value: trigger.threshold.value,
          },
          triggered: trigger.triggered,
          disabled: trigger.disabled,
          frequency: trigger.frequency,
          alert_type: trigger.alert_type,
        }));
        
        const activeCount = simplifiedTriggers.filter(trigger => !trigger.disabled).length;
        const triggeredCount = simplifiedTriggers.filter(trigger => trigger.triggered).length;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedTriggers, null, 2),
            },
          ],
          metadata: {
            count: simplifiedTriggers.length,
            activeCount,
            triggeredCount,
            dataset,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "list_triggers");
      }
    }
  };
}
