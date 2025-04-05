/**
 * Cache module for the Honeycomb MCP server
 * Uses @stacksjs/ts-cache for resource caching
 */

import cache, { Cache } from '@stacksjs/ts-cache';
import { z } from 'zod';
import type { Config } from '../config.js';

// Define cache configuration schema
export const CacheConfigSchema = z.object({
  // Default TTL for cached items in seconds
  defaultTTL: z.number().int().positive().default(300),
  // TTL for specific resource types
  ttl: z.object({
    dataset: z.number().int().positive().default(900), // 15 minutes
    column: z.number().int().positive().default(900),  // 15 minutes
    board: z.number().int().positive().default(900),   // 15 minutes
    slo: z.number().int().positive().default(900),     // 15 minutes
    trigger: z.number().int().positive().default(900), // 15 minutes
    marker: z.number().int().positive().default(900),  // 15 minutes
    recipient: z.number().int().positive().default(900), // 15 minutes
    auth: z.number().int().positive().default(3600),   // 1 hour
  }).default({
    dataset: 900,
    column: 900,
    board: 900,
    slo: 900,
    trigger: 900,
    marker: 900,
    recipient: 900,
    auth: 3600
  }),
  // Whether to enable caching
  enabled: z.boolean().default(true),
  // Maximum size of each cache (number of items)
  maxSize: z.number().int().positive().default(1000),
}).default({
  defaultTTL: 300,
  ttl: {
    dataset: 900,
    column: 900,
    board: 900,
    slo: 900,
    trigger: 900,
    marker: 900,
    recipient: 900,
    auth: 3600
  },
  enabled: true,
  maxSize: 1000
});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;

const defaultCacheConfig: CacheConfig = {
  defaultTTL: 300,
  ttl: {
    dataset: 900,
    column: 900,
    board: 900,
    slo: 900,
    trigger: 900,
    marker: 900,
    recipient: 900,
    auth: 3600
  },
  enabled: true,
  maxSize: 1000
};

// Cache key format: environment:resource:id
export type CacheKey = string;
export type ResourceType = 
  | 'dataset' 
  | 'column' 
  | 'board' 
  | 'slo' 
  | 'trigger' 
  | 'marker' 
  | 'recipient'
  | 'auth';

// Class to manage caches for different resource types
/**
 * Options for paging and filtering cached collections
 */
export interface CacheAccessOptions {
  // Pagination options
  page?: number;
  limit?: number;
  offset?: number;
  
  // Filtering options
  filter?: (item: any) => boolean;
  search?: {
    field: string | string[];
    term: string;
    caseInsensitive?: boolean;
  };
  
  // Sorting options
  sort?: {
    field: string;
    order?: 'asc' | 'desc';
  };
}

export class CacheManager {
  private caches: Map<ResourceType, Cache>;
  private config: CacheConfig;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = CacheConfigSchema.parse({...defaultCacheConfig, ...config});
    this.caches = new Map();
    
    // Initialize caches for each resource type
    const resourceTypes: ResourceType[] = [
      'dataset', 'column', 'board', 'slo', 
      'trigger', 'marker', 'recipient', 'auth'
    ];
    
    for (const resourceType of resourceTypes) {
      const ttl = this.config.ttl[resourceType] || this.config.defaultTTL;
      this.caches.set(
        resourceType, 
        new Cache({
          ttl,
          maxKeys: this.config.maxSize,
          useClones: true,
        })
      );
    }
  }
  
  /**
   * Generate a cache key for a resource
   * 
   * @param environment - The environment name
   * @param resourceType - The type of resource
   * @param resourceId - The resource identifier (optional)
   * @returns The cache key
   */
  public generateKey(
    environment: string, 
    resourceType: ResourceType, 
    resourceId?: string
  ): CacheKey {
    return resourceId 
      ? `${environment}:${resourceType}:${resourceId}`
      : `${environment}:${resourceType}`;
  }
  
  /**
   * Get an item from the cache
   * 
   * @param environment - The environment name
   * @param resourceType - The type of resource
   * @param resourceId - The resource identifier (optional)
   * @returns The cached item or undefined if not found
   */
  public get<T>(
    environment: string, 
    resourceType: ResourceType, 
    resourceId?: string
  ): T | undefined {
    if (!this.config.enabled) return undefined;
    
    const cache = this.caches.get(resourceType);
    if (!cache) return undefined;
    
    const key = this.generateKey(environment, resourceType, resourceId);
    return cache.get<T>(key);
  }
  
  /**
   * Set an item in the cache
   * 
   * @param environment - The environment name
   * @param resourceType - The type of resource
   * @param data - The data to cache
   * @param resourceId - The resource identifier (optional)
   */
  public set<T>(
    environment: string, 
    resourceType: ResourceType, 
    data: T, 
    resourceId?: string
  ): void {
    if (!this.config.enabled) return;
    
    const cache = this.caches.get(resourceType);
    if (!cache) return;
    
    const key = this.generateKey(environment, resourceType, resourceId);
    const ttl = this.config.ttl[resourceType] || this.config.defaultTTL;
    cache.set<T>(key, data, ttl);
  }
  
  /**
   * Remove an item from the cache
   * 
   * @param environment - The environment name
   * @param resourceType - The type of resource
   * @param resourceId - The resource identifier (optional)
   */
  public remove(
    environment: string, 
    resourceType: ResourceType, 
    resourceId?: string
  ): void {
    if (!this.config.enabled) return;
    
    const cache = this.caches.get(resourceType);
    if (!cache) return;
    
    const key = this.generateKey(environment, resourceType, resourceId);
    cache.del(key);
  }
  
  /**
   * Clear all items for a specific resource type
   * 
   * @param resourceType - The type of resource
   */
  public clearResourceType(resourceType: ResourceType): void {
    const cache = this.caches.get(resourceType);
    if (cache) cache.flushAll();
  }
  
  /**
   * Clear all caches
   */
  public clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.flushAll();
    }
  }
  
  /**
   * Access cached collection with paging, filtering, and sorting
   * 
   * This allows tools to page through or search within cached responses
   * without having to fetch from the API again.
   * 
   * @param environment - The environment name
   * @param resourceType - The type of resource (must be a collection)
   * @param resourceId - The resource identifier (optional)
   * @param options - Options for paging, filtering, and sorting
   * @returns Processed collection based on options, or undefined if not in cache
   */
  public accessCollection<T>(
    environment: string,
    resourceType: ResourceType,
    resourceId?: string,
    options: CacheAccessOptions = {}
  ): { data: T[], total: number, page?: number, pages?: number } | undefined {
    // Get the raw cached collection
    const collection = this.get<T[]>(environment, resourceType, resourceId);
    if (!collection || !Array.isArray(collection)) return undefined;
    
    // Make a copy to avoid modifying the cached data
    let result = [...collection];
    
    // Apply filtering if specified
    if (options.filter && typeof options.filter === 'function') {
      result = result.filter(options.filter);
    }
    
    // Apply search if specified
    if (options.search) {
      const { field, term, caseInsensitive = true } = options.search;
      const fields = Array.isArray(field) ? field : [field];
      const searchTerm = caseInsensitive ? term.toLowerCase() : term;
      
      result = result.filter(item => {
        return fields.some(f => {
          const value = this.getNestedValue(item, f);
          if (typeof value === 'string') {
            const itemValue = caseInsensitive ? value.toLowerCase() : value;
            return itemValue.includes(searchTerm);
          }
          return false;
        });
      });
    }
    
    // Get total before pagination
    const total = result.length;
    
    // Apply sorting if specified
    if (options.sort) {
      const { field, order = 'asc' } = options.sort;
      result.sort((a, b) => {
        const aValue = this.getNestedValue(a, field);
        const bValue = this.getNestedValue(b, field);
        
        // Handle different data types
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return order === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        // Default numeric comparison
        return order === 'asc' 
          ? (aValue > bValue ? 1 : -1) 
          : (bValue > aValue ? 1 : -1);
      });
    }
    
    // Apply pagination if specified
    let page = 1;
    let pages = 1;
    
    if (options.limit) {
      const limit = options.limit;
      
      // Calculate offset based on page or offset parameter
      let offset = options.offset || 0;
      if (options.page && options.page > 0) {
        page = options.page;
        offset = (page - 1) * limit;
      }
      
      // Calculate total pages
      pages = Math.ceil(total / limit);
      
      // Apply pagination
      result = result.slice(offset, offset + limit);
    }
    
    return {
      data: result,
      total,
      page,
      pages
    };
  }
  
  /**
   * Helper method to get nested properties from an object
   * Supports dot notation: "user.address.city"
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, i) => (o ? o[i] : undefined), obj);
  }
}

// Create a singleton instance
let cacheManager: CacheManager | null = null;

// Export for testing
export const resetCacheManager = () => {
  cacheManager = null;
};

/**
 * Initialize the cache manager with the provided configuration
 * 
 * @param config - The configuration object
 * @returns The initialized cache manager
 */
export function initializeCache(appConfig: Config): CacheManager {
  // Extract cache config from environment variables or use defaults
  const cacheConfig: CacheConfig = {
    enabled: process.env.HONEYCOMB_CACHE_ENABLED !== 'false',
    defaultTTL: parseInt(process.env.HONEYCOMB_CACHE_DEFAULT_TTL || '300', 10),
    ttl: {
      dataset: parseInt(process.env.HONEYCOMB_CACHE_DATASET_TTL || '900', 10),
      column: parseInt(process.env.HONEYCOMB_CACHE_COLUMN_TTL || '900', 10),
      board: parseInt(process.env.HONEYCOMB_CACHE_BOARD_TTL || '900', 10),
      slo: parseInt(process.env.HONEYCOMB_CACHE_SLO_TTL || '900', 10),
      trigger: parseInt(process.env.HONEYCOMB_CACHE_TRIGGER_TTL || '900', 10),
      marker: parseInt(process.env.HONEYCOMB_CACHE_MARKER_TTL || '900', 10),
      recipient: parseInt(process.env.HONEYCOMB_CACHE_RECIPIENT_TTL || '900', 10),
      auth: parseInt(process.env.HONEYCOMB_CACHE_AUTH_TTL || '3600', 10),
    },
    maxSize: parseInt(process.env.HONEYCOMB_CACHE_MAX_SIZE || '1000', 10),
  };
  
  cacheManager = new CacheManager(cacheConfig);
  return cacheManager;
}

/**
 * Get the cache manager instance
 * 
 * @returns The cache manager instance
 * @throws Error if the cache manager has not been initialized
 */
export function getCache(): CacheManager {
  if (!cacheManager) {
    throw new Error('Cache manager has not been initialized. Call initializeCache first.');
  }
  return cacheManager;
}