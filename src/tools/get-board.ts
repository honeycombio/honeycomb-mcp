import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { GetBoardSchema } from "../types/schema.js";

/**
 * Tool to get a specific board (dashboard) from a Honeycomb environment
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetBoardTool(api: HoneycombAPI) {
  return {
    name: "get_board",
    schema: GetBoardSchema.shape,
    /**
     * Handler for the get_board tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.boardId - The ID of the board to retrieve
     * @returns Board details
     */
    handler: async ({ environment, boardId }: z.infer<typeof GetBoardSchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "get_board");
      }
      
      if (!boardId) {
        return handleToolError(new Error("boardId parameter is required"), "get_board");
      }

      try {
        // Fetch board from the API
        const board = await api.getBoard(environment, boardId);
        
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
      } catch (error) {
        return handleToolError(error, "get_board");
      }
    }
  };
}