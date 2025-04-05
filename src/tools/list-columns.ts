import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ListColumnsSchema } from "../types/schema.js";
import { getCache } from "../cache/index.js";
import { PaginatedResponse, CollectionOptions } from "../types/api.js";

/**
 * Interface for simplified column data returned by the list_columns tool
 */
interface SimplifiedColumn {
  name: string;
  type: string;
  description: string;
  hidden: boolean;
  last_written?: string | null;
  created_at: string;
}

/**
 * Tool to list columns for a specific dataset. This tool returns a list of all columns available 
 * in the specified dataset, including their names, types, descriptions, and hidden status,
 * with support for pagination, sorting, and filtering.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListColumnsTool(api: HoneycombAPI) {
  return {
    name: "list_columns",
    description: "Lists all columns available in the specified dataset, including their names, types, descriptions, and hidden status. Supports pagination, sorting by type/name/created_at, and searching by name/description. Note: __all__ is NOT supported as a dataset name.",
    schema: ListColumnsSchema.shape,
    /**
     * Handler for the list_columns tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset to fetch columns from
     * @param params.page - Optional page number for pagination
     * @param params.limit - Optional limit of items per page
     * @param params.sort_by - Optional field to sort by
     * @param params.sort_order - Optional sort direction (asc/desc)
     * @param params.search - Optional search term
     * @param params.search_fields - Optional fields to search in
     * @returns Simplified list of columns with relevant metadata, potentially paginated
     */
    handler: async (params: z.infer<typeof ListColumnsSchema>) => {
      const { environment, dataset, page, limit, sort_by, sort_order, search, search_fields } = params;
      
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_columns");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "list_columns");
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
          last_written: column.last_written || null,
          created_at: column.created_at,
        }));
        
        // If no pagination or filtering is requested, return all columns
        if (!page && !limit && !search && !sort_by) {
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
        }
        
        // Otherwise, use the cache manager to handle pagination, sorting, and filtering
        const cache = getCache();
        const cacheKey = `${dataset}:columns`;
        
        // First, ensure the columns are in the cache
        // This is different from other resources that are automatically cached by API calls
        cache.set(environment, 'column', simplifiedColumns, cacheKey);
        
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
          'column', 
          cacheKey, 
          cacheOptions
        );
        
        // If the collection isn't in cache yet, apply the filtering manually
        if (!result) {
          // Basic implementation for non-cached data
          let filteredColumns = [...simplifiedColumns];
          
          // Apply search if requested
          if (search) {
            const searchFields = Array.isArray(search_fields) 
              ? search_fields 
              : search_fields 
                ? [search_fields] 
                : ['name', 'description'];
                
            const searchTerm = search.toLowerCase();
            
            filteredColumns = filteredColumns.filter(column => {
              return searchFields.some(field => {
                const value = column[field as keyof typeof column];
                return typeof value === 'string' && value.toLowerCase().includes(searchTerm);
              });
            });
          }
          
          // Apply sorting if requested
          if (sort_by) {
            const field = sort_by;
            const order = sort_order || 'asc';
            
            filteredColumns.sort((a, b) => {
              const aValue = a[field as keyof typeof a];
              const bValue = b[field as keyof typeof b];
              
              if (typeof aValue === 'string' && typeof bValue === 'string') {
                return order === 'asc' 
                  ? aValue.localeCompare(bValue) 
                  : bValue.localeCompare(aValue);
              }
              
              // Null-safe comparison for nullable values
              if (aValue === null || aValue === undefined) return order === 'asc' ? -1 : 1;
              if (bValue === null || bValue === undefined) return order === 'asc' ? 1 : -1;
              
              return order === 'asc' 
                ? (aValue > bValue ? 1 : -1) 
                : (bValue > aValue ? 1 : -1);
            });
          }
          
          // Apply pagination
          const itemLimit = limit || 10;
          const currentPage = page || 1;
          const total = filteredColumns.length;
          const pages = Math.ceil(total / itemLimit);
          const offset = (currentPage - 1) * itemLimit;
          
          // Return formatted response
          const paginatedResponse: PaginatedResponse<typeof simplifiedColumns[0]> = {
            data: filteredColumns.slice(offset, offset + itemLimit),
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
        const typedData = result.data as typeof simplifiedColumns;
        
        // Format the cached result
        const paginatedResponse: PaginatedResponse<typeof simplifiedColumns[0]> = {
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
        return handleToolError(error, "list_columns");
      }
    }
  };
}