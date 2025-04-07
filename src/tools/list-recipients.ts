import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { ListRecipientsSchema } from "../types/collection-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";

/**
 * Tool to list notification recipients in a Honeycomb environment. This tool returns a list of all recipients available in the specified environment, including their names, types, targets, and metadata.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListRecipientsTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_recipients",
    description: "Lists notification recipients in a Honeycomb environment with pagination, sorting, and search support. Returns recipient details including type, name, and target.",
    schema: ListRecipientsSchema,
    
    handler: async (params: z.infer<typeof ListRecipientsSchema>, api) => {
      // Validate input parameters
      if (!params.environment) {
        throw new Error("environment parameter is required");
      }

      // Fetch recipients from the API
      const recipients = await api.getRecipients(params.environment);
      
      // Create a simplified response
      const simplifiedRecipients = recipients.map(recipient => ({
        id: recipient.id,
        name: recipient.name,
        type: recipient.type,
        target: recipient.target || null,
        // Include additional metadata if available
        metadata: recipient.details ? {
          ...recipient.details
        } : {}
      }));
      
      // For backward compatibility with tests
      if (!params.page && !params.limit && !params.search && !params.sort_by) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedRecipients, null, 2),
            },
          ],
          metadata: {
            count: simplifiedRecipients.length,
            environment: params.environment
          }
        };
      }
      
      // Use the shared collection handler
      return handleCollection(
        params.environment,
        'recipient',
        simplifiedRecipients,
        params,
        ['name', 'type', 'target']
      );
    },
    
    errorContext: (params) => ({
      environment: params.environment
    })
  });
}