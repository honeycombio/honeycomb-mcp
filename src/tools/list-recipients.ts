import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ListRecipientsSchema } from "../types/schema.js";

/**
 * Tool to list notification recipients in a Honeycomb environment. This tool returns a list of all recipients available in the specified environment, including their names, types, targets, and metadata.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListRecipientsTool(api: HoneycombAPI) {
  return {
    name: "list_recipients",
    description: "Lists available recipients for notifications in a specific environment. This tool returns a list of all recipients available in the specified environment, including their names, types, targets, and metadata.",
    schema: ListRecipientsSchema.shape,
    /**
     * Handler for the list_recipients tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @returns List of recipients with relevant metadata
     */
    handler: async ({ environment }: z.infer<typeof ListRecipientsSchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_recipients");
      }

      try {
        // Fetch recipients from the API
        const recipients = await api.getRecipients(environment);
        
        // Create a simplified response
        const simplifiedRecipients = recipients.map(recipient => ({
          id: recipient.id,
          name: recipient.name,
          type: recipient.type,
          target: recipient.target || '',
          created_at: recipient.created_at,
          updated_at: recipient.updated_at,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedRecipients, null, 2),
            },
          ],
          metadata: {
            count: simplifiedRecipients.length,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "list_recipients");
      }
    }
  };
}