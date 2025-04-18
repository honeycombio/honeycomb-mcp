import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListDatasetsTool } from './list-datasets.js';
import { HoneycombError } from '../utils/errors.js';

// Create a mock cache manager
const mockCacheManager = {
  get: vi.fn(),
  set: vi.fn(),
  accessCollection: vi.fn()
};

// Mock cache module
vi.mock('../cache/index.js', () => ({
  getCache: () => mockCacheManager,
  CacheManager: vi.fn().mockImplementation(() => mockCacheManager)
}));

describe('list-datasets tool', () => {
  // Mock API
  const mockApi = {
    listDatasets: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return a valid tool configuration', () => {
    const tool = createListDatasetsTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'list_datasets');
    expect(tool).toHaveProperty('inputSchema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should list datasets successfully', async () => {
    // Test dataset data
    const testDatasets = [
      { 
        name: 'Production', 
        slug: 'prod',
        description: 'Production environment logs'
      },
      { 
        name: 'Development', 
        slug: 'dev',
        description: null
      }
    ];

    // Setup mock API response
    mockApi.listDatasets.mockResolvedValue(testDatasets);

    const tool = createListDatasetsTool(mockApi as any);
    const result = await tool.handler({ environment: 'test-env' });

    // Verify API was called with correct parameters
    expect(mockApi.listDatasets).toHaveBeenCalledWith('test-env');

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify datasets are returned
    expect(response).toHaveLength(2);
    expect(response[0]).toHaveProperty('name', 'Production');
    expect(response[0]).toHaveProperty('slug', 'prod');
    expect(response[0]).toHaveProperty('description', 'Production environment logs');
    expect(response[1]).toHaveProperty('description', '');  // Empty string for null description
  });

  it('should handle empty dataset list', async () => {
    // Setup mock API response with empty array
    mockApi.listDatasets.mockResolvedValue([]);

    const tool = createListDatasetsTool(mockApi as any);
    const result = await tool.handler({ environment: 'test-env' });
    
    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('text');
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify empty array is returned
    expect(response).toEqual([]);
  });

  it('should handle missing environment parameter', async () => {
    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createListDatasetsTool(mockApi as any);
      const result = await tool.handler({ environment: '' });

      // Verify error response
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0]!.text!).toContain('Failed to execute tool');
      expect(result.content[0]!.text!).toContain('Missing required parameter: environment');
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(403, 'Invalid API key');
    mockApi.listDatasets.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createListDatasetsTool(mockApi as any);
      const result = await tool.handler({ environment: 'test-env' });

      // Verify error response
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0]!.text!).toContain('Failed to execute tool');
      expect(result.content[0]!.text!).toContain('Invalid API key');
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });
  
  describe('with pagination and filtering', () => {
    // Test dataset data with more entries
    const testDatasets = [
      { name: 'API', slug: 'api', description: 'API logs', created_at: '2023-01-01T00:00:00Z', last_written_at: '2023-05-01T00:00:00Z' },
      { name: 'Backend', slug: 'backend', description: 'Backend services', created_at: '2023-01-02T00:00:00Z', last_written_at: '2023-05-02T00:00:00Z' },
      { name: 'Frontend', slug: 'frontend', description: 'Frontend services', created_at: '2023-01-03T00:00:00Z', last_written_at: '2023-05-03T00:00:00Z' },
      { name: 'Database', slug: 'db', description: 'Database metrics', created_at: '2023-01-04T00:00:00Z', last_written_at: '2023-05-04T00:00:00Z' },
      { name: 'Caching', slug: 'cache', description: 'Cache performance', created_at: '2023-01-05T00:00:00Z', last_written_at: '2023-05-05T00:00:00Z' }
    ];
    
    beforeEach(() => {
      // Setup mock API response
      mockApi.listDatasets.mockResolvedValue(testDatasets);
      
      // Reset cache mock
      mockCacheManager.accessCollection.mockReset();
    });
    
    it('should return paginated results when using page and limit parameters', async () => {
      // Mock the cache accessCollection to return paginated results
      mockCacheManager.accessCollection.mockReturnValue({
        data: [testDatasets[0], testDatasets[1]],
        total: 5,
        page: 1,
        pages: 3
      });
      
      const tool = createListDatasetsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: 'test-env',
        page: 1,
        limit: 2
      });
      
      // Verify API was called
      expect(mockApi.listDatasets).toHaveBeenCalledWith('test-env');
      
      // Verify cache was used with correct parameters
      expect(mockCacheManager.accessCollection).toHaveBeenCalledWith(
        'test-env', 
        'dataset', 
        undefined, 
        expect.objectContaining({
          page: 1,
          limit: 2
        })
      );
      
      // Check response structure
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0]!.text!);
      
      // Verify the paginated structure
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('total', 5);
      expect(response.metadata).toHaveProperty('page', 1);
      expect(response.metadata).toHaveProperty('pages', 3);
      expect(response.metadata).toHaveProperty('limit', 2);
      expect(response.data).toHaveLength(2);
    });
    
    it('should support sorting results', async () => {
      // Mock the cache accessCollection for sorted results
      mockCacheManager.accessCollection.mockReturnValue({
        data: [
          testDatasets[0], // API (first alphabetically)
          testDatasets[1]  // Backend (second alphabetically)
        ],
        total: 5,
        page: 1,
        pages: 3
      });
      
      const tool = createListDatasetsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: 'test-env',
        page: 1,
        limit: 2,
        sort_by: 'name',
        sort_order: 'asc'
      });
      
      // Verify cache was used with correct parameters
      expect(mockCacheManager.accessCollection).toHaveBeenCalledWith(
        'test-env', 
        'dataset', 
        undefined, 
        expect.objectContaining({
          sort: {
            field: 'name',
            order: 'asc'
          }
        })
      );
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0]!.text!);
      
      // Verify the sorted structure
      expect(response.data).toHaveLength(2);
      expect(response.data[0].name).toBe('API');
      expect(response.data[1].name).toBe('Backend');
    });
    
    it('should support searching results', async () => {
      // Mock the cache accessCollection for search results
      mockCacheManager.accessCollection.mockReturnValue({
        data: [testDatasets[3]], // Database (matches "data" search)
        total: 1,
        page: 1,
        pages: 1
      });
      
      const tool = createListDatasetsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: 'test-env',
        search: 'data',
        search_fields: ['name', 'description']
      });
      
      // Verify cache was used with correct parameters
      expect(mockCacheManager.accessCollection).toHaveBeenCalledWith(
        'test-env', 
        'dataset', 
        undefined, 
        expect.objectContaining({
          search: {
            field: ['name', 'description'],
            term: 'data',
            caseInsensitive: true
          }
        })
      );
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0]!.text!);
      
      // Verify the search results
      expect(response.data).toHaveLength(1);
      expect(response.data[0].name).toBe('Database');
    });
    
    it('should handle direct filtering when cache is not available', async () => {
      // Mock the cache accessCollection to return undefined (no cache hit)
      mockCacheManager.accessCollection.mockReturnValue(undefined);
      
      const tool = createListDatasetsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: 'test-env',
        page: 1,
        limit: 2,
        sort_by: 'name',
        sort_order: 'asc'
      });
      
      // Verify the API was called
      expect(mockApi.listDatasets).toHaveBeenCalledWith('test-env');
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0]!.text!);
      
      // Should still get paginated results from direct handling
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('total');
      expect(response.metadata).toHaveProperty('page', 1);
      expect(response.data).toHaveLength(2);
    });
  });
});