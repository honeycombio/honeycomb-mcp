import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetColumnsTool } from './get-columns.js';
import { HoneycombError } from '../utils/errors.js';
import { Column } from '../types/column.js';

describe('get-columns tool', () => {
  // Mock API
  const mockApi = {
    getVisibleColumns: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
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
    }
  ];

  it('should return a valid tool configuration', () => {
    const tool = createGetColumnsTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'get_columns');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should return simplified columns when API call succeeds', async () => {
    // Setup mock API response
    mockApi.getVisibleColumns.mockResolvedValue(mockColumns);

    const tool = createGetColumnsTool(mockApi as any);
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
    expect(response).toHaveLength(2);
    expect(response[0]).toHaveProperty('name', 'column1');
    expect(response[0]).toHaveProperty('type', 'string');
    expect(response[0]).toHaveProperty('description', 'First column description');
    expect(response[0]).toHaveProperty('hidden', false);
    expect(response[0]).not.toHaveProperty('id');
    expect(response[0]).not.toHaveProperty('created_at');
    
    expect(response[1]).toHaveProperty('name', 'column2');
    expect(response[1]).toHaveProperty('type', 'integer');
  });

  it('should handle empty columns list', async () => {
    // Setup API to return empty columns array
    mockApi.getVisibleColumns.mockResolvedValue([]);

    const tool = createGetColumnsTool(mockApi as any);
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
      const tool = createGetColumnsTool(mockApi as any);
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
});