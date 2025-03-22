import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { DatasetArgumentsSchema } from "../types/schema.js";

/**
 * Tool to list triggers for a specific dataset
 */
export function createListTriggersTool(api: HoneycombAPI) {
  return {
    name: "list_triggers",
    schema: DatasetArgumentsSchema.shape,
    handler: async ({ environment, dataset }: z.infer<typeof DatasetArgumentsSchema>) => {
      try {
        const triggers = await api.getTriggers(environment, dataset);
        // Simplify the response to reduce context window usage
        const simplifiedTriggers = triggers.map(trigger => ({
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
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedTriggers, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "list_triggers");
      }
    }
  };
}
