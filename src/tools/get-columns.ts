import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";

/**
 * Interface for simplified column data returned by the get_columns tool
 */
interface SimplifiedColumn {
  name: string;
  type: string;
  description: string;
  hidden: boolean;
}

/**
 * Tool to get columns for a specific dataset
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetColumnsTool(api: HoneycombAPI) {
  return {
    name: "get_columns",
    schema: {
      environment: z.string().describe("The Honeycomb environment"),
      dataset: z.string().describe("The dataset to fetch columns from"),
    },
    /**
     * Handler for the get_columns tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset to fetch columns from
     * @returns Simplified list of columns with relevant metadata
     */
    handler: async ({ environment, dataset }: { environment: string; dataset: string }) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "get_columns");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "get_columns");
      }

      try {
        // Fetch columns from the API
        const columns = await api.getVisibleColumns(environment, dataset);
        
        // Simplify the response to reduce context window usage
        const simplifiedColumns: SimplifiedColumn[] = columns.map(column => ({
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
          metadata: {
            count: simplifiedColumns.length,
            dataset,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "get_columns");
      }
    }
  };
}
