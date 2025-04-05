import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ListMarkersSchema } from "../types/schema.js";
import { getCache } from "../cache/index.js";
import { PaginatedResponse } from "../types/api.js";

/**
 * Tool to list markers (deployment events) in a Honeycomb environment. This tool returns a list of all markers available in the specified environment, including their IDs, messages, types, URLs, creation times, start times, and end times.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListMarkersTool(api: HoneycombAPI) {
  return {
    name: "list_markers",
    description: "Lists available markers (deployment events) for a specific dataset or environment with pagination, sorting, and search support. Returns IDs, messages, types, URLs, creation times, start times, and end times.",
    schema: ListMarkersSchema.shape,
    /**
     * Handler for the list_markers tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.page - Optional page number for pagination
     * @param params.limit - Optional limit of items per page
     * @param params.sort_by - Optional field to sort by
     * @param params.sort_order - Optional sort direction (asc/desc)
     * @param params.search - Optional search term
     * @param params.search_fields - Optional fields to search in
     * @returns List of markers with relevant metadata, potentially paginated
     */
    handler: async (params: z.infer<typeof ListMarkersSchema>) => {
      const { environment, page, limit, sort_by, sort_order, search, search_fields } = params;
      
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_markers");
      }

      try {
        // Fetch markers from the API
        const markers = await api.getMarkers(environment);
        
        // Create a simplified response
        const simplifiedMarkers = markers.map(marker => ({
          id: marker.id,
          message: marker.message,
          type: marker.type,
          url: marker.url || '',
          created_at: marker.created_at,
          start_time: marker.start_time,
          end_time: marker.end_time || '',
        }));
        
        // If no pagination or filtering is requested, return all markers
        if (!page && !limit && !search && !sort_by) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(simplifiedMarkers, null, 2),
              },
            ],
            metadata: {
              count: simplifiedMarkers.length,
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
              field: search_fields || ['message', 'type'],
              term: search,
              caseInsensitive: true
            }
          })
        };
        
        // Access the collection with pagination and filtering
        const result = cache.accessCollection(
          environment, 
          'marker', 
          undefined, 
          cacheOptions
        );
        
        // If the collection isn't in cache yet, apply the filtering manually
        if (!result) {
          // Basic implementation for non-cached data
          let filteredMarkers = [...simplifiedMarkers];
          
          // Apply search if requested
          if (search) {
            const searchFields = Array.isArray(search_fields) 
              ? search_fields 
              : search_fields 
                ? [search_fields] 
                : ['message', 'type'];
                
            const searchTerm = search.toLowerCase();
            
            filteredMarkers = filteredMarkers.filter(marker => {
              return searchFields.some(field => {
                const value = marker[field as keyof typeof marker];
                return typeof value === 'string' && value.toLowerCase().includes(searchTerm);
              });
            });
          }
          
          // Apply sorting if requested
          if (sort_by) {
            const field = sort_by;
            const order = sort_order || 'asc';
            
            filteredMarkers.sort((a, b) => {
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
          const total = filteredMarkers.length;
          const pages = Math.ceil(total / itemLimit);
          const offset = (currentPage - 1) * itemLimit;
          
          // Return formatted response
          const paginatedResponse: PaginatedResponse<typeof simplifiedMarkers[0]> = {
            data: filteredMarkers.slice(offset, offset + itemLimit),
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
        
        // Format the cached result
        const paginatedResponse: PaginatedResponse<typeof simplifiedMarkers[0]> = {
          data: result.data,
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
        return handleToolError(error, "list_markers");
      }
    }
  };
}