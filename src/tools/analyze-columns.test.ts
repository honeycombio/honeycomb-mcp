import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalyzeColumnsTool } from './analyze-columns.js';
import { HoneycombError } from '../utils/errors.js';

describe('analyze-columns tool', () => {
  // Create more complete mock API to match our refactored structure
  const mockApi = {
    getVisibleColumns: vi.fn(),
    analyzeColumn: vi.fn(),
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test parameters
  const testParams = {
    environment: 'test-env',
    dataset: 'test-dataset',
    columns: ['test-column1', 'test-column2']
  };

  it('should return a valid tool configuration', () => {
    const tool = createAnalyzeColumnsTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'analyze_columns');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should process numeric data correctly', async () => {
    // Mock the columns API response
    mockApi.getVisibleColumns.mockResolvedValue([
      { key_name: 'test-column1', type: 'float', hidden: false },
      { key_name: 'test-column2', type: 'string', hidden: false }
    ]);

    // Mock the column analysis response for each column
    mockApi.analyzeColumn.mockImplementation((env, dataset, column) => {
      if (column === 'test-column1') {
        return Promise.resolve({
          sample_count: 10,
          unique_count: 2,
          top_values: [
            { value: 'value1', count: 10 },
            { value: 'value2', count: 5 }
          ],
          min: 5,
          max: 30,
          avg: 15.5,
          p50: 15,
          p90: 18,
          p95: 20,
          p99: 28
        });
      } else {
        return Promise.resolve({
          sample_count: 15,
          unique_count: 2,
          top_values: [
            { value: 'valueA', count: 10 },
            { value: 'valueB', count: 5 }
          ]
        });
      }
    });

    const tool = createAnalyzeColumnsTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API calls
    expect(mockApi.getVisibleColumns).toHaveBeenCalledWith(
      testParams.environment,
      testParams.dataset
    );
    
    expect(mockApi.analyzeColumn).toHaveBeenCalledTimes(2);
    
    expect(mockApi.analyzeColumn).toHaveBeenCalledWith(
      testParams.environment,
      testParams.dataset,
      'test-column1',
      undefined
    );

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify contents
    expect(response).toHaveProperty('environment', 'test-env');
    expect(response).toHaveProperty('dataset', 'test-dataset');
    expect(response).toHaveProperty('columns');
    expect(response.columns).toHaveProperty('test-column1');
    expect(response.columns).toHaveProperty('test-column2');
    
    // Check numeric column stats
    expect(response.columns['test-column1']).toHaveProperty('numeric_stats');
    expect(response.columns['test-column1'].numeric_stats).toHaveProperty('min', 5);
    expect(response.columns['test-column1'].numeric_stats).toHaveProperty('max', 30);
    expect(response.columns['test-column1'].numeric_stats).toHaveProperty('avg', 15.5);
    expect(response.columns['test-column1'].numeric_stats).toHaveProperty('interpretation');
    
    // Check cardinality
    expect(response.columns['test-column1']).toHaveProperty('cardinality', 'low');
  });

  it('should handle empty results', async () => {
    // Mock empty visible columns
    mockApi.getVisibleColumns.mockResolvedValue([
      { key_name: 'test-column1', type: 'string', hidden: false },
      { key_name: 'test-column2', type: 'string', hidden: false }
    ]);
    
    // Mock empty column analysis
    mockApi.analyzeColumn.mockResolvedValue({
      sample_count: 0,
      unique_count: 0
    });

    const tool = createAnalyzeColumnsTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Parse the JSON response
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('text');
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify simple response with no data
    expect(response).toHaveProperty('environment', 'test-env');
    expect(response).toHaveProperty('dataset', 'test-dataset');
    expect(response).toHaveProperty('columns');
    expect(response.columns).toHaveProperty('test-column1');
    expect(response.columns).toHaveProperty('test-column2');
    expect(response.columns['test-column1']).toHaveProperty('sample_count', 0);
    expect(response.columns['test-column1']).toHaveProperty('unique_count', 0);
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(404, 'Dataset not found');
    mockApi.getVisibleColumns.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createAnalyzeColumnsTool(mockApi as any);
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