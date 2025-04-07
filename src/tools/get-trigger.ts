import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { TriggerArgumentsSchema } from "../types/resource-schemas.js";
import { createTool } from "../utils/tool-factory.js";

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
 * Tool to get a specific trigger (alert) by ID. This tool returns a detailed object containing the trigger's ID, name, description, threshold, frequency, alert type, triggered status, disabled status, recipients, evaluation schedule type, and timestamps.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetTriggerTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "get_trigger",
    description: "Retrieves a specific alert trigger with its configuration details and status.",
    schema: TriggerArgumentsSchema,
    
    handler: async (params: z.infer<typeof TriggerArgumentsSchema>, api) => {
      // Extract parameters
      const { environment, dataset, triggerId } = params;
      
      // Validate parameters
      if (!environment) {
        throw new Error("Missing required parameter: environment");
      }
      if (!dataset) {
        throw new Error("Missing required parameter: dataset");
      }
      if (!triggerId) {
        throw new Error("Missing required parameter: triggerId");
      }
      
      // Get the trigger from the API
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
      
      // Return the trigger details with status metadata
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
    },
    
    errorContext: (params) => ({
      environment: params.environment,
      dataset: params.dataset,
      triggerId: params.triggerId
    })
  });
}