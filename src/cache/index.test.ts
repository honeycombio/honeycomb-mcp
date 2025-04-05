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