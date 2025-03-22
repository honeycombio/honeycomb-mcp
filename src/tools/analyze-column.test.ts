import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalyzeColumnTool } from './analyze-column.js';
import { HoneycombError } from '../utils/errors.js';

describe('analyze-column tool', () => {
  // Mock API
  const mockApi = {
    analyzeColumn: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test parameters
  const testParams = {
    environment: 'test-env',
    dataset: 'test-dataset',
    column: 'test-column'
  };

  it('should return a valid tool configuration', () => {
    const tool = createAnalyzeColumnTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'analyze_column');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should process numeric data correctly', async () => {
    // Setup mock API response
    mockApi.analyzeColumn.mockResolvedValue({
      data: {
        results: [
          { 
            'test-column': 'value1', 
            COUNT: 10,
            AVG: 15.5,
            P95: 20,
            MAX: 30,
            MIN: 5
          },
          { 
            'test-column': 'value2', 
            COUNT: 5
          }
        ]
      }
    });

    const tool = createAnalyzeColumnTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API was called with correct parameters
    expect(mockApi.analyzeColumn).toHaveBeenCalledWith(
      testParams.environment,
      testParams.dataset,
      testParams
    );

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify contents
    expect(response).toHaveProperty('column', 'test-column');
    expect(response).toHaveProperty('count', 2);
    expect(response).toHaveProperty('totalEvents', 15);
    expect(response).toHaveProperty('topValues');
    expect(response.topValues).toHaveLength(2);
    expect(response).toHaveProperty('stats');
    expect(response.stats).toHaveProperty('avg', 15.5);
    expect(response.stats).toHaveProperty('interpretation');
    expect(response).toHaveProperty('cardinality');
    expect(response.cardinality).toHaveProperty('uniqueCount', 2);
  });

  it('should handle empty results', async () => {
    mockApi.analyzeColumn.mockResolvedValue({
      data: {
        results: []
      }
    });

    const tool = createAnalyzeColumnTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Parse the JSON response
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('text');
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify simple response with no data
    expect(response).toHaveProperty('column', 'test-column');
    expect(response).toHaveProperty('count', 0);
    expect(response).toHaveProperty('totalEvents', 0);
    expect(response).not.toHaveProperty('topValues');
    expect(response).not.toHaveProperty('stats');
    expect(response).not.toHaveProperty('cardinality');
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(404, 'Dataset not found');
    mockApi.analyzeColumn.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createAnalyzeColumnTool(mockApi as any);
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