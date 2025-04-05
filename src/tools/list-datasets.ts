import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { getCache } from "../cache/index.js";
import { CollectionOptions, PaginatedResponse } from "../types/api.js";

/**
 * Schema for the list_datasets tool parameters
 */
const ListDatasetsSchema = z.object({
  environment: z.string().min(1, "Environment name cannot be empty"),
  // Optional pagination, sorting, and filtering parameters
  page: z.number().optional(),
  limit: z.number().optional(),
  sort_by: z.enum(['name', 'slug', 'created_at', 'last_written_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  search_fields: z.union([
    z.string(),
    z.array(z.string())
  ]).optional()
});

/**
 * Creates a tool for listing datasets in a Honeycomb environment
 * 
 * This tool returns a list of all datasets available in the specified environment,
 * including their names, slugs, and descriptions. It supports pagination, sorting,
 * and text search capabilities.
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createListDatasetsTool(api: HoneycombAPI) {
  return {
    name: "list_datasets",
    description: "Lists available datasets for the active environment with pagination, sorting, and search support. Returns dataset names, slugs, descriptions, and timestamps.",
    schema: {
      environment: z.string(),
      page: z.number().optional(),
      limit: z.number().optional(), 
      sort_by: z.enum(['name', 'slug', 'created_at', 'last_written_at']).optional(),
      sort_order: z.enum(['asc', 'desc']).optional(),
      search: z.string().optional(),
      search_fields: z.union([z.string(), z.array(z.string())]).optional()
    },
    /**
     * Handles the list_datasets tool request with pagination and search
     * 
     * @param params - The parameters containing environment and optional pagination/search options
     * @returns A formatted paginated response with the list of datasets
     */
    handler: async (params: { 
      environment: string 
    } & CollectionOptions) => {
      try {
        // Validate required parameters
        if (!params.environment) {
          throw new Error("Missing required parameter: environment");
        }

        // Fetch datasets from the API
        const datasets = await api.listDatasets(params.environment);
        
        // Simplify the datasets to reduce context window usage
        const simplifiedDatasets = datasets.map(dataset => ({
          name: dataset.name,
          slug: dataset.slug,
          description: dataset.description || '',
          created_at: dataset.created_at,
          last_written_at: dataset.last_written_at,
        }));
        
        // If no pagination or filtering is requested, return all datasets
        if (!params.page && !params.limit && !params.search && !params.sort_by) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(simplifiedDatasets, null, 2),
              },
            ],
          };
        }
        
        // Otherwise, use the cache manager to handle pagination, sorting, and filtering
        const cache = getCache();
        const cacheOptions = {
          page: params.page || 1,
          limit: params.limit || 10,
          
          // Configure sorting if requested
          ...(params.sort_by && {
            sort: {
              field: params.sort_by,
              order: params.sort_order || 'asc'
            }
          }),
          
          // Configure search if requested
          ...(params.search && {
            search: {
              field: params.search_fields || ['name', 'slug', 'description'],
              term: params.search,
              caseInsensitive: true
            }
          })
        };
        
        // Access the collection with pagination and filtering
        const result = cache.accessCollection(
          params.environment, 
          'dataset', 
          undefined, 
          cacheOptions
        );
        
        // If the collection isn't in cache yet, apply the filtering manually
        // This should rarely happen since we just fetched the datasets from the API
        if (!result) {
          // Basic implementation for non-cached data
          let filteredDatasets = [...simplifiedDatasets];
          
          // Apply search if requested
          if (params.search) {
            const searchFields = Array.isArray(params.search_fields) 
              ? params.search_fields 
              : params.search_fields 
                ? [params.search_fields] 
                : ['name', 'slug', 'description'];
                
            const searchTerm = params.search.toLowerCase();
            
            filteredDatasets = filteredDatasets.filter(dataset => {
              return searchFields.some(field => {
                const value = dataset[field as keyof typeof dataset];
                return typeof value === 'string' && value.toLowerCase().includes(searchTerm);
              });
            });
          }
          
          // Apply sorting if requested
          if (params.sort_by) {
            const field = params.sort_by;
            const order = params.sort_order || 'asc';
            
            filteredDatasets.sort((a, b) => {
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
          const limit = params.limit || 10;
          const page = params.page || 1;
          const total = filteredDatasets.length;
          const pages = Math.ceil(total / limit);
          const offset = (page - 1) * limit;
          
          // Return formatted response
          const paginatedResponse: PaginatedResponse<typeof simplifiedDatasets[0]> = {
            data: filteredDatasets.slice(offset, offset + limit),
            metadata: {
              total,
              page,
              pages,
              limit
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
        const typedData = result.data as typeof simplifiedDatasets;
        
        const paginatedResponse: PaginatedResponse<typeof simplifiedDatasets[0]> = {
          data: typedData,
          metadata: {
            total: result.total,
            page: result.page || 1,
            pages: result.pages || 1,
            limit: params.limit || 10
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
        return handleToolError(error, "list_datasets");
      }
    }
  };
}
