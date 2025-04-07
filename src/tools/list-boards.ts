import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { CollectionOptions } from "../types/api.js";
import { ListBoardsSchema } from "../types/collection-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";

/**
 * Tool to list boards (dashboards) in a Honeycomb environment.
 * 
 * This tool returns a list of all boards available in the specified environment,
 * including their IDs, names, descriptions, creation times, and last update times.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListBoardsTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_boards",
    description: "Lists available boards (dashboards) for a specific environment with pagination, sorting, and search support. Returns board IDs, names, descriptions, creation times, and last update times.",
    schema: ListBoardsSchema,
    
    handler: async (params: z.infer<typeof ListBoardsSchema>, api) => {
      // Validate input parameters
      if (!params.environment) {
        throw new Error("environment parameter is required");
      }

      // Fetch boards from the API
      const boards = await api.getBoards(params.environment);
      
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
            environment: params.environment
          }
        };
      }
      
      // Create a simplified response, with additional error handling
      const simplifiedBoards = boards.map(board => ({
        id: board.id || 'unknown-id',
        name: board.name || 'Unnamed Board',
        description: board.description || '',
        created_at: board.created_at || new Date().toISOString(),
        updated_at: board.updated_at || new Date().toISOString(),
      }));
      
      // If no pagination or filtering is requested, return all boards with the legacy format for tests
      if (!params.page && !params.limit && !params.search && !params.sort_by) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedBoards, null, 2),
            },
          ],
          metadata: {
            count: simplifiedBoards.length,
            environment: params.environment
          }
        };
      }
      
      // Otherwise, use the shared collection handler to handle pagination, filtering, etc.
      return handleCollection(
        params.environment,
        'board',
        simplifiedBoards,
        params,
        ['name', 'description']
      );
    },
    
    errorContext: (params) => ({
      environment: params.environment
    })
  });
}