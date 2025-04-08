import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { GetBoardSchema } from "../types/resource-schemas.js";
import { createTool } from "../utils/tool-factory.js";

/**
 * Tool to get a specific board (dashboard) from a Honeycomb environment. This tool returns a detailed object containing the board's ID, name, description, creation time, and last update time.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetBoardTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "get_board",
    description: "Retrieves a specific board (dashboard) from a Honeycomb environment. Returns the board's queries, visualizations, and metadata.",
    schema: GetBoardSchema,
    
    /**
     * Handler for the get_board tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.boardId - The ID of the board to retrieve
     * @returns Detailed information about the specified board
     */
    handler: async (params: z.infer<typeof GetBoardSchema>, api) => {
      // Extract parameters
      const { environment, boardId } = params;
      
      // Validate parameters
      if (!environment || environment.trim() === '') {
        throw new Error("environment parameter is required");
      }
      if (!boardId || boardId.trim() === '') {
        throw new Error("boardId parameter is required");
      }

      // Get the board from the API
      const board = await api.getBoard(environment, boardId);
      
      // Return the board details
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(board, null, 2),
          },
        ],
        metadata: {
          environment,
          boardId,
          name: board.name
        }
      };
    },
    
    // Add error context function
    errorContext: (params) => ({
      environment: params.environment,
      boardId: params.boardId
    })
  });
}