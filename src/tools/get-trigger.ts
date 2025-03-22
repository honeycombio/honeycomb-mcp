import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Tool to get a specific trigger by ID
 */
export function createGetTriggerTool(api: HoneycombAPI) {
  return {
    name: "get_trigger",
    schema: {
      environment: z.string(),
      dataset: z.string(),
      triggerId: z.string(),
    },
    handler: async ({ environment, dataset, triggerId }: { environment: string; dataset: string; triggerId: string }) => {
      try {
        const trigger = await api.getTrigger(environment, dataset, triggerId);
        // Simplify the response to reduce context window usage
        const simplifiedTrigger = {
          id: trigger.id,
          name: trigger.name,
          description: trigger.description || '',
          threshold: {
            op: trigger.threshold.op,
            value: trigger.threshold.value,
          },
          frequency: trigger.frequency,
          alert_type: trigger.alert_type,
          triggered: trigger.triggered,
          disabled: trigger.disabled,
          recipients: trigger.recipients.map(r => ({
            type: r.type,
            target: r.target,
          })),
          evaluation_schedule_type: trigger.evaluation_schedule_type,
          created_at: trigger.created_at,
          updated_at: trigger.updated_at,
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedTrigger, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_trigger");
      }
    }
  };
}
