import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ListBoardsSchema } from "../types/schema.js";

/**
 * Tool to list boards (dashboards) in a Honeycomb environment
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListBoardsTool(api: HoneycombAPI) {
  return {
    name: "list_boards",
    schema: ListBoardsSchema.shape,
    /**
     * Handler for the list_boards tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @returns List of boards with relevant metadata
     */
    handler: async ({ environment }: z.infer<typeof ListBoardsSchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_boards");
      }

      try {
        // Fetch boards from the API
        const boards = await api.getBoards(environment);
        
        // Safety check - ensure boards is an array
        if (!Array.isArray(boards)) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify([], null, 2),
              },
            ],
            metadata: {
              count: 0,
              environment
            }
          };
        }
        
        // Create a simplified response, with additional error handling
        const simplifiedBoards = boards.map(board => {
          // Create a copy with defaults for missing fields
          return {
            id: board.id || 'unknown-id',
            name: board.name || 'Unnamed Board',
            description: board.description || '',
            created_at: board.created_at || new Date().toISOString(),
            updated_at: board.updated_at || new Date().toISOString(),
          };
        });
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedBoards, null, 2),
            },
          ],
          metadata: {
            count: simplifiedBoards.length,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "list_boards");
      }
    }
  };
}