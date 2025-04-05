import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListColumnsTool } from './list-columns.js';
import { HoneycombError } from '../utils/errors.js';
import { Column } from '../types/column.js';

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

describe('list-columns tool', () => {
  // Mock API
  const mockApi = {
    getVisibleColumns: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
    mockCacheManager.accessCollection.mockReset();
  });

  // Test parameters
  const testParams = {
    environment: 'test-env',
    dataset: 'test-dataset'
  };

  // Sample columns response
  const mockColumns: Column[] = [
    {
      id: '1',
      key_name: 'column1',
      type: 'string',
      description: 'First column description',
      hidden: false,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    },
    {
      id: '2',
      key_name: 'column2',
      type: 'integer',
      description: 'Second column description',
      hidden: false,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      last_written: '2023-01-02T00:00:00Z'
    },
    {
      id: '3',
      key_name: 'column3',
      type: 'boolean',
      description: 'Boolean flag',
      hidden: false,
      created_at: '2023-01-02T00:00:00Z',
      updated_at: '2023-01-02T00:00:00Z'
    },
    {
      id: '4',
      key_name: 'timestamp',
      type: 'float',
      description: 'Timestamp field',
      hidden: false,
      created_at: '2023-01-03T00:00:00Z',
      updated_at: '2023-01-03T00:00:00Z'
    },
    {
      id: '5',
      key_name: 'user_id',
      type: 'string',
      description: 'User identifier',
      hidden: false,
      created_at: '2023-01-04T00:00:00Z',
      updated_at: '2023-01-04T00:00:00Z'
    }
  ];

  it('should return a valid tool configuration', () => {
    const tool = createListColumnsTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'list_columns');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should return simplified columns when API call succeeds', async () => {
    // Setup mock API response
    mockApi.getVisibleColumns.mockResolvedValue(mockColumns);

    const tool = createListColumnsTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API was called with correct parameters
    expect(mockApi.getVisibleColumns).toHaveBeenCalledWith(
      testParams.environment,
      testParams.dataset
    );

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify contents contains simplified column data
    expect(response).toHaveLength(5);
    expect(response[0]).toHaveProperty('name', 'column1');
    expect(response[0]).toHaveProperty('type', 'string');
    expect(response[0]).toHaveProperty('description', 'First column description');
    expect(response[0]).toHaveProperty('hidden', false);
    expect(response[0]).toHaveProperty('created_at');
    
    expect(response[1]).toHaveProperty('name', 'column2');
    expect(response[1]).toHaveProperty('type', 'integer');
  });

  it('should handle empty columns list', async () => {
    // Setup API to return empty columns array
    mockApi.getVisibleColumns.mockResolvedValue([]);

    const tool = createListColumnsTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Parse the JSON response
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('text');
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify empty array is returned
    expect(response).toEqual([]);
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(404, 'Dataset not found');
    mockApi.getVisibleColumns.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createListColumnsTool(mockApi as any);
      const result = await tool.handler(testParams);

      // Verify error response
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0]!.text!).toContain('Failed to execute tool');
      expect(result.content[0]!.text!).toContain('Dataset not found');
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });

  describe('with pagination and filtering', () => {
    beforeEach(() => {
      // Setup API response for all tests in this block
      mockApi.getVisibleColumns.mockResolvedValue(mockColumns);
    });

    it('should return paginated results when using page and limit parameters', async () => {
      // Mock the cache accessCollection to return paginated results
      mockCacheManager.accessCollection.mockReturnValue({
        data: [
          { name: 'column1', type: 'string', description: 'First column description', hidden: false },
          { name: 'column2', type: 'integer', description: 'Second column description', hidden: false }
        ],
        total: 5,
        page: 1,
        pages: 3
      });
      
      const tool = createListColumnsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: testParams.environment,
        dataset: testParams.dataset,
        page: 1,
        limit: 2
      });
      
      // Verify API was called
      expect(mockApi.getVisibleColumns).toHaveBeenCalledWith(
        testParams.environment,
        testParams.dataset
      );
      
      // Verify cache was used with correct parameters
      expect(mockCacheManager.accessCollection).toHaveBeenCalledWith(
        testParams.environment, 
        'column', 
        `${testParams.dataset}:columns`, 
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
          { name: 'column1', type: 'string', description: 'First column description', hidden: false },
          { name: 'column3', type: 'boolean', description: 'Boolean flag', hidden: false }
        ],
        total: 5,
        page: 1,
        pages: 3
      });
      
      const tool = createListColumnsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: testParams.environment,
        dataset: testParams.dataset,
        sort_by: 'type',
        sort_order: 'asc'
      });
      
      // Verify cache was used with correct parameters
      expect(mockCacheManager.accessCollection).toHaveBeenCalledWith(
        testParams.environment, 
        'column', 
        `${testParams.dataset}:columns`, 
        expect.objectContaining({
          sort: {
            field: 'type',
            order: 'asc'
          }
        })
      );
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0]!.text!);
      
      // Verify the sorted data structure
      expect(response.data).toHaveLength(2);
    });
    
    it('should support searching results', async () => {
      // Mock the cache accessCollection for search results
      mockCacheManager.accessCollection.mockReturnValue({
        data: [
          { name: 'user_id', type: 'string', description: 'User identifier', hidden: false }
        ],
        total: 1,
        page: 1,
        pages: 1
      });
      
      const tool = createListColumnsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: testParams.environment,
        dataset: testParams.dataset,
        search: 'user',
        search_fields: ['name', 'description']
      });
      
      // Verify cache was used with correct parameters
      expect(mockCacheManager.accessCollection).toHaveBeenCalledWith(
        testParams.environment, 
        'column', 
        `${testParams.dataset}:columns`, 
        expect.objectContaining({
          search: {
            field: ['name', 'description'],
            term: 'user',
            caseInsensitive: true
          }
        })
      );
      
      // Parse the JSON response
      const response = JSON.parse(result.content[0]!.text!);
      
      // Verify the search results
      expect(response.data).toHaveLength(1);
    });
    
    it('should handle direct filtering when cache is not available', async () => {
      // Mock the cache accessCollection to return undefined (no cache hit)
      mockCacheManager.accessCollection.mockReturnValue(undefined);
      
      const tool = createListColumnsTool(mockApi as any);
      const result = await tool.handler({ 
        environment: testParams.environment,
        dataset: testParams.dataset,
        page: 1,
        limit: 2,
        sort_by: 'name',
        sort_order: 'asc'
      });
      
      // Verify the API was called
      expect(mockApi.getVisibleColumns).toHaveBeenCalledWith(
        testParams.environment,
        testParams.dataset
      );
      
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