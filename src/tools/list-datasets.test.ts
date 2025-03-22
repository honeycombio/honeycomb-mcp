import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListDatasetsTool } from './list-datasets.js';
import { HoneycombError } from '../utils/errors.js';

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
    expect(tool).toHaveProperty('schema');
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
});