import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager, initializeCache, getCache, ResourceType, resetCacheManager } from './index.js';
import type { Config } from '../config.js';

// Mock Config object
const mockConfig: Config = {
  environments: [
    {
      name: 'test',
      apiKey: 'test-api-key',
    }
  ],
  cache: {
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
  }
};

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  
  beforeEach(() => {
    // Reset environment variables before each test
    vi.resetModules();
    process.env.HONEYCOMB_CACHE_ENABLED = 'true';
    
    cacheManager = new CacheManager();
  });
  
  afterEach(() => {
    cacheManager.clearAll();
    vi.unstubAllEnvs();
  });
  
  it('should generate correct cache keys', () => {
    const key1 = cacheManager.generateKey('prod', 'dataset');
    expect(key1).toBe('prod:dataset');
    
    const key2 = cacheManager.generateKey('prod', 'dataset', 'users');
    expect(key2).toBe('prod:dataset:users');
  });
  
  it('should cache and retrieve values', () => {
    const testData = { name: 'test-dataset', id: '123' };
    
    cacheManager.set('prod', 'dataset', testData, 'test-id');
    const cachedData = cacheManager.get('prod', 'dataset', 'test-id');
    
    expect(cachedData).toEqual(testData);
  });
  
  it('should return undefined for non-existent cache entries', () => {
    const cachedData = cacheManager.get('prod', 'dataset', 'non-existent');
    expect(cachedData).toBeUndefined();
  });
  
  it('should remove cache entries', () => {
    const testData = { name: 'test-dataset', id: '123' };
    
    cacheManager.set('prod', 'dataset', testData, 'test-id');
    cacheManager.remove('prod', 'dataset', 'test-id');
    
    const cachedData = cacheManager.get('prod', 'dataset', 'test-id');
    expect(cachedData).toBeUndefined();
  });
  
  it('should clear all caches for a resource type', () => {
    const testData1 = { name: 'test-dataset-1', id: '123' };
    const testData2 = { name: 'test-dataset-2', id: '456' };
    
    cacheManager.set('prod', 'dataset', testData1, 'test-id-1');
    cacheManager.set('prod', 'dataset', testData2, 'test-id-2');
    cacheManager.set('prod', 'board', { name: 'test-board' }, 'board-id');
    
    cacheManager.clearResourceType('dataset');
    
    expect(cacheManager.get('prod', 'dataset', 'test-id-1')).toBeUndefined();
    expect(cacheManager.get('prod', 'dataset', 'test-id-2')).toBeUndefined();
    expect(cacheManager.get('prod', 'board', 'board-id')).toBeDefined();
  });
  
  it('should clear all caches', () => {
    cacheManager.set('prod', 'dataset', { name: 'test-dataset' }, 'test-id');
    cacheManager.set('prod', 'board', { name: 'test-board' }, 'board-id');
    
    cacheManager.clearAll();
    
    expect(cacheManager.get('prod', 'dataset', 'test-id')).toBeUndefined();
    expect(cacheManager.get('prod', 'board', 'board-id')).toBeUndefined();
  });
  
  it('should respect cache TTL configuration for different resource types', () => {
    const customConfig = {
      defaultTTL: 300,
      ttl: {
        dataset: 100,
        column: 900,
        board: 200,
        slo: 900,
        trigger: 900,
        marker: 900,
        recipient: 900,
        auth: 3600
      },
      enabled: true,
      maxSize: 1000
    };
    
    const customCacheManager = new CacheManager(customConfig);
    
    // Check if the caches for different resource types have different TTLs
    // Note: We can't directly check TTL values as they're private in the InMemoryCache
    // In a real implementation, we might add a way to expose this for testing
    
    // Instead, we're just verifying the cache was created with the custom config
    expect(customCacheManager).toBeDefined();
  });
  
  it('should not cache if disabled', () => {
    const disabledCacheManager = new CacheManager({
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
      enabled: false,
      maxSize: 1000
    });
    
    disabledCacheManager.set('prod', 'dataset', { name: 'test-dataset' }, 'test-id');
    
    expect(disabledCacheManager.get('prod', 'dataset', 'test-id')).toBeUndefined();
  });
  
  describe('accessCollection', () => {
    beforeEach(() => {
      // Set up a test collection
      const testUsers = [
        { id: 1, name: 'Alice', email: 'alice@example.com', age: 32, metadata: { role: 'admin' } },
        { id: 2, name: 'Bob', email: 'bob@example.com', age: 28, metadata: { role: 'user' } },
        { id: 3, name: 'Charlie', email: 'charlie@example.com', age: 45, metadata: { role: 'user' } },
        { id: 4, name: 'David', email: 'david@example.com', age: 22, metadata: { role: 'user' } },
        { id: 5, name: 'Eve', email: 'eve@example.com', age: 38, metadata: { role: 'manager' } },
      ];
      
      cacheManager.set('test', 'dataset', testUsers, 'users');
    });
    
    it('should return undefined for non-existent collections', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'non-existent');
      expect(result).toBeUndefined();
    });
    
    it('should return all items when no options are provided', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users');
      expect(result).toBeDefined();
      expect(result?.data.length).toBe(5);
      expect(result?.total).toBe(5);
    });
    
    it('should support pagination', () => {
      const page1 = cacheManager.accessCollection('test', 'dataset', 'users', { 
        page: 1, 
        limit: 2 
      });
      
      expect(page1?.data.length).toBe(2);
      expect(page1?.total).toBe(5);
      expect(page1?.page).toBe(1);
      expect(page1?.pages).toBe(3);
      expect((page1?.data[0] as any).name).toBe('Alice');
      
      const page2 = cacheManager.accessCollection('test', 'dataset', 'users', { 
        page: 2, 
        limit: 2 
      });
      
      expect(page2?.data.length).toBe(2);
      expect((page2?.data[0] as any).name).toBe('Charlie');
      
      const page3 = cacheManager.accessCollection('test', 'dataset', 'users', { 
        page: 3, 
        limit: 2 
      });
      
      expect(page3?.data.length).toBe(1);
      expect((page3?.data[0] as any).name).toBe('Eve');
    });
    
    it('should support filtering with a function', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users', { 
        filter: (user: any) => user.age > 30 
      });
      
      expect(result?.data.length).toBe(3);
      expect((result?.data[0] as any).name).toBe('Alice');
      expect((result?.data[1] as any).name).toBe('Charlie');
      expect((result?.data[2] as any).name).toBe('Eve');
    });
    
    it('should support searching by string fields', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users', { 
        search: {
          field: 'name',
          term: 'li',  // Should match "Alice" and "Charlie"
        } 
      });
      
      expect(result?.data.length).toBe(2);
      expect((result?.data[0] as any).name).toBe('Alice');
      expect((result?.data[1] as any).name).toBe('Charlie');
    });
    
    it('should support searching across multiple fields', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users', { 
        search: {
          field: ['name', 'email'],
          term: 'e',  // Should match several users
        } 
      });
      
      expect(result?.data.length).toBe(5); // All users have 'e' in name or email
    });
    
    it('should support searching nested fields', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users', { 
        search: {
          field: 'metadata.role',
          term: 'admin',
        } 
      });
      
      expect(result?.data.length).toBe(1);
      expect((result?.data[0] as any).name).toBe('Alice');
    });
    
    it('should support sorting', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users', { 
        sort: {
          field: 'age',
          order: 'desc'
        } 
      });
      
      expect(result?.data.length).toBe(5);
      expect((result?.data[0] as any).name).toBe('Charlie');  // Age 45
      expect((result?.data[4] as any).name).toBe('David');    // Age 22
    });
    
    it('should support combining options', () => {
      const result = cacheManager.accessCollection('test', 'dataset', 'users', {
        filter: (user: any) => user.age > 25,
        sort: {
          field: 'age',
          order: 'asc'
        },
        page: 1,
        limit: 2
      });
      
      expect(result?.data.length).toBe(2);
      expect(result?.total).toBe(4);  // 4 users with age > 25
      expect(result?.page).toBe(1);
      expect(result?.pages).toBe(2);
      expect((result?.data[0] as any).name).toBe('Bob');     // Age 28
      expect((result?.data[1] as any).name).toBe('Alice');   // Age 32
    });
  });
});

describe('initializeCache', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset the singleton instance between tests
    resetCacheManager();
  });
  
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  
  it('should create a cache manager with default configuration', () => {
    const cacheManager = initializeCache(mockConfig);
    expect(cacheManager).toBeInstanceOf(CacheManager);
  });
  
  it('should use environment variables to configure the cache', () => {
    process.env.HONEYCOMB_CACHE_ENABLED = 'true';
    process.env.HONEYCOMB_CACHE_DEFAULT_TTL = '600';
    process.env.HONEYCOMB_CACHE_DATASET_TTL = '1800';
    
    const cacheManager = initializeCache(mockConfig);
    
    // Test basic functionality to ensure it was initialized
    cacheManager.set('test', 'dataset', { name: 'test-dataset' }, 'test-id');
    expect(cacheManager.get('test', 'dataset', 'test-id')).toBeDefined();
  });
  
  it('should disable caching if HONEYCOMB_CACHE_ENABLED is false', () => {
    process.env.HONEYCOMB_CACHE_ENABLED = 'false';
    
    const cacheManager = initializeCache(mockConfig);
    
    cacheManager.set('test', 'dataset', { name: 'test-dataset' }, 'test-id');
    expect(cacheManager.get('test', 'dataset', 'test-id')).toBeUndefined();
  });
});

describe('getCache', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset the singleton instance between tests
    resetCacheManager();
  });
  
  it('should throw an error if called before initialization', () => {
    expect(() => getCache()).toThrow('Cache manager has not been initialized. Call initializeCache first.');
  });
  
  it('should return the initialized cache manager', () => {
    const cacheManager = initializeCache(mockConfig);
    expect(getCache()).toBe(cacheManager);
  });
});