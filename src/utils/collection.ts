/**
 * Shared utilities for working with collections (lists) and pagination
 */
import { getCache } from "../cache/index.js";
import { CollectionOptions, PaginatedResponse } from "../types/api.js";
import { ToolResponseContent } from "./tool-factory.js";

/**
 * Helper function to handle filtering, sorting, and pagination for collection data
 * 
 * This function centralizes the logic that was duplicated across multiple list tools
 * and provides a consistent approach to handling collections of data.
 * 
 * @param environment - The Honeycomb environment
 * @param resourceType - The type of resource being processed (e.g., 'dataset', 'board')
 * @param items - The array of items to process
 * @param options - Collection options for pagination, sorting, and filtering
 * @param searchableFields - Default fields to search if not specified in options
 * @param cacheKey - Optional specific cache key for the resource
 * @returns Formatted response with filtered, sorted, and paginated data
 */
export function handleCollection<T extends Record<string, any>>(
  environment: string,
  resourceType: string,
  items: T[],
  options: CollectionOptions,
  searchableFields: string[] = [],
  cacheKey?: string
): ToolResponseContent {
  // If no pagination or filtering is requested, return all items
  if (!options.page && !options.limit && !options.search && !options.sort_by) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(items, null, 2),
        },
      ],
    };
  }
  
  // Try to use the cache manager to handle pagination, sorting, and filtering
  const cache = getCache();
  const cacheOptions = {
    page: options.page || 1,
    limit: options.limit || 10,
    
    // Configure sorting if requested
    ...(options.sort_by && {
      sort: {
        field: options.sort_by,
        order: options.sort_order || 'asc'
      }
    }),
    
    // Configure search if requested
    ...(options.search && {
      search: {
        field: options.search_fields || searchableFields,
        term: options.search,
        caseInsensitive: true
      }
    })
  };
  
  // Access the collection with pagination and filtering
  const result = cache.accessCollection(
    environment, 
    resourceType as any, 
    cacheKey, 
    cacheOptions
  );
  
  // If the collection isn't in cache yet, apply the filtering manually
  if (!result) {
    // Basic implementation for non-cached data
    let filteredItems = [...items];
    
    // Apply search if requested
    if (options.search) {
      const searchFields = Array.isArray(options.search_fields) 
        ? options.search_fields 
        : options.search_fields 
          ? [options.search_fields] 
          : searchableFields;
          
      const searchTerm = options.search.toLowerCase();
      
      filteredItems = filteredItems.filter(item => {
        return searchFields.some(field => {
          const value = item[field as keyof typeof item];
          return typeof value === 'string' && value.toLowerCase().includes(searchTerm);
        });
      });
    }
    
    // Apply sorting if requested
    if (options.sort_by) {
      const field = options.sort_by;
      const order = options.sort_order || 'asc';
      
      filteredItems.sort((a, b) => {
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
    const limit = options.limit || 10;
    const page = options.page || 1;
    const total = filteredItems.length;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    
    // Return formatted response
    const paginatedResponse: PaginatedResponse<T> = {
      data: filteredItems.slice(offset, offset + limit),
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
  const typedData = result.data as T[];
  
  const paginatedResponse: PaginatedResponse<T> = {
    data: typedData,
    metadata: {
      total: result.total,
      page: result.page || 1,
      pages: result.pages || 1,
      limit: options.limit || 10
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