import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Interface for simplified recipient data in a trigger
 */
interface SimplifiedRecipient {
  type: string;
  target?: string;
}

/**
 * Interface for simplified trigger data returned by the get_trigger tool
 */
interface SimplifiedTriggerDetails {
  id: string;
  name: string;
  description: string;
  threshold: {
    op: string;
    value: number;
  };
  frequency: number;
  alert_type?: string;
  triggered: boolean;
  disabled: boolean;
  recipients: SimplifiedRecipient[];
  evaluation_schedule_type?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Tool to get a specific trigger (alert) by ID with detailed information
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetTriggerTool(api: HoneycombAPI) {
  return {
    name: "get_trigger",
    schema: {
      environment: z.string().describe("The Honeycomb environment"),
      dataset: z.string().describe("The dataset containing the trigger"),
      triggerId: z.string().describe("The ID of the trigger to retrieve"),
    },
    /**
     * Handler for the get_trigger tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset containing the trigger
     * @param params.triggerId - The ID of the trigger to retrieve
     * @returns Detailed information about the specified trigger
     */
    handler: async ({ environment, dataset, triggerId }: { environment: string; dataset: string; triggerId: string }) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "get_trigger");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "get_trigger");
      }
      if (!triggerId) {
        return handleToolError(new Error("triggerId parameter is required"), "get_trigger");
      }

      try {
        // Fetch trigger details from the API
        const trigger = await api.getTrigger(environment, dataset, triggerId);
        
        // Simplify the response to reduce context window usage
        const simplifiedTrigger: SimplifiedTriggerDetails = {
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
          metadata: {
            triggerId,
            dataset,
            environment,
            status: trigger.triggered ? "TRIGGERED" : trigger.disabled ? "DISABLED" : "ACTIVE"
          }
        };
      } catch (error) {
        return handleToolError(error, "get_trigger");
      }
    }
  };
}
