import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ListBoardsSchema } from "../types/schema.js";
import { getCache } from "../cache/index.js";
import { CollectionOptions, PaginatedResponse } from "../types/api.js";

/**
 * Tool to list boards (dashboards) in a Honeycomb environment. This tool returns a list of all boards available in the specified environment, including their IDs, names, descriptions, creation times, and last update times.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListBoardsTool(api: HoneycombAPI) {
  return {
    name: "list_boards",
    description: "Lists available boards (dashboards) for a specific environment with pagination, sorting, and search support. Returns board IDs, names, descriptions, creation times, and last update times.",
    schema: ListBoardsSchema.shape,
    /**
     * Handler for the list_boards tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.page - Optional page number for pagination
     * @param params.limit - Optional limit of items per page
     * @param params.sort_by - Optional field to sort by
     * @param params.sort_order - Optional sort direction (asc/desc)
     * @param params.search - Optional search term
     * @param params.search_fields - Optional fields to search in
     * @returns List of boards with relevant metadata, potentially paginated
     */
    handler: async (params: z.infer<typeof ListBoardsSchema>) => {
      const { environment, page, limit, sort_by, sort_order, search, search_fields } = params;
      
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
        
        // If no pagination or filtering is requested, return all boards
        if (!page && !limit && !search && !sort_by) {
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
        }
        
        // Otherwise, use the cache manager to handle pagination, sorting, and filtering
        const cache = getCache();
        const cacheOptions = {
          page: page || 1,
          limit: limit || 10,
          
          // Configure sorting if requested
          ...(sort_by && {
            sort: {
              field: sort_by,
              order: sort_order || 'asc'
            }
          }),
          
          // Configure search if requested
          ...(search && {
            search: {
              field: search_fields || ['name', 'description'],
              term: search,
              caseInsensitive: true
            }
          })
        };
        
        // Access the collection with pagination and filtering
        const result = cache.accessCollection(
          environment, 
          'board', 
          undefined, 
          cacheOptions
        );
        
        // If the collection isn't in cache yet, apply the filtering manually
        if (!result) {
          // Basic implementation for non-cached data
          let filteredBoards = [...simplifiedBoards];
          
          // Apply search if requested
          if (search) {
            const searchFields = Array.isArray(search_fields) 
              ? search_fields 
              : search_fields 
                ? [search_fields] 
                : ['name', 'description'];
                
            const searchTerm = search.toLowerCase();
            
            filteredBoards = filteredBoards.filter(board => {
              return searchFields.some(field => {
                const value = board[field as keyof typeof board];
                return typeof value === 'string' && value.toLowerCase().includes(searchTerm);
              });
            });
          }
          
          // Apply sorting if requested
          if (sort_by) {
            const field = sort_by;
            const order = sort_order || 'asc';
            
            filteredBoards.sort((a, b) => {
              const aValue = a[field as keyof typeof a];
              const bValue = b[field as keyof typeof b];
              
              if (typeof aValue === 'string' && typeof bValue === 'string') {
                return order === 'asc' 
                  ? aValue.localeCompare(bValue) 
                  : bValue.localeCompare(aValue);
              }
              
              return order === 'asc' 
                ? (aValue > bValue ? 1 : -1) 
                : (bValue > aValue ? 1 : -1);
            });
          }
          
          // Apply pagination
          const itemLimit = limit || 10;
          const currentPage = page || 1;
          const total = filteredBoards.length;
          const pages = Math.ceil(total / itemLimit);
          const offset = (currentPage - 1) * itemLimit;
          
          // Return formatted response
          const paginatedResponse: PaginatedResponse<typeof simplifiedBoards[0]> = {
            data: filteredBoards.slice(offset, offset + itemLimit),
            metadata: {
              total,
              page: currentPage,
              pages,
              limit: itemLimit
            }
          };
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(paginatedResponse, null, 2),
              },
            ],
          };
        }
        
        // Format the cached result and type-cast the unknown data
        const typedData = result.data as typeof simplifiedBoards;
        
        const paginatedResponse: PaginatedResponse<typeof simplifiedBoards[0]> = {
          data: typedData,
          metadata: {
            total: result.total,
            page: result.page || 1,
            pages: result.pages || 1,
            limit: limit || 10
          }
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(paginatedResponse, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "list_boards");
      }
    }
  };
}