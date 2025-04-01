import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { GetBoardSchema } from "../types/schema.js";

/**
 * Tool to get a specific board (dashboard) from a Honeycomb environment. This tool returns a detailed object containing the board's ID, name, description, creation time, and last update time.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetBoardTool(api: HoneycombAPI) {
  return {
    name: "get_board",
    description: "Retrieves a specific board (dashboard) from a Honeycomb environment. This tool returns a detailed object containing the board's ID, name, description, creation time, and last update time.",
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
        
        // Extract a default dataset from the board if available
        // We'll use this as a fallback for queries without a specified dataset
        const defaultDataset = board.queries?.find(q => q.dataset)?.dataset || '__all__';
        
        // Enhance the board response by ensuring each query has a dataset
        // This is important for enabling users to fetch queries by ID
        const enhancedBoard = {
          ...board,
          queries: board.queries?.map(query => {
            // If the query has no dataset, use the default dataset from the board
            return {
              ...query,
              dataset: query.dataset || defaultDataset,
              // Add a note if we have a query_id
              note: query.query_id ? 
                'Use run_saved_query tool with environment, dataset, and queryId to run this query directly, or get_query to retrieve its definition' 
                : undefined
            };
          })
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(enhancedBoard, null, 2),
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