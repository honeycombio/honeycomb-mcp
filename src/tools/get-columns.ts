import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Tool to get columns for a specific dataset
 */
export function createGetColumnsTool(api: HoneycombAPI) {
  return {
    name: "get_columns",
    schema: {
      environment: z.string(),
      dataset: z.string(),
    },
    handler: async ({ environment, dataset }: { environment: string; dataset: string }) => {
      try {
        const columns = await api.getVisibleColumns(environment, dataset);
        // Simplify the response to reduce context window usage
        const simplifiedColumns = columns.map(column => ({
          name: column.key_name,
          type: column.type,
          description: column.description || '',
          hidden: column.hidden || false,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedColumns, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_columns");
      }
    }
  };
}
