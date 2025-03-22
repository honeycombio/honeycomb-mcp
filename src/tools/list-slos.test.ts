import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListSLOsTool } from './list-slos.js';
import { HoneycombError } from '../utils/errors.js';
import { SLO } from '../types/slo.js';

describe('list-slos tool', () => {
  // Mock API
  const mockApi = {
    getSLOs: vi.fn()
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

  // Sample SLOs response
  const mockSLOs: SLO[] = [
    {
      id: 'slo-1',
      name: 'API Availability',
      description: 'API availability target',
      sli: { alias: 'sli-availability' },
      time_period_days: 30,
      target_per_million: 995000,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    },
    {
      id: 'slo-2',
      name: 'API Latency',
      description: 'API latency target',
      sli: { alias: 'sli-latency' },
      time_period_days: 7,
      target_per_million: 990000,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    }
  ];

  it('should return a valid tool configuration', () => {
    const tool = createListSLOsTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'list_slos');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should return simplified SLOs when API call succeeds', async () => {
    // Setup mock API response
    mockApi.getSLOs.mockResolvedValue(mockSLOs);

    const tool = createListSLOsTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API was called with correct parameters
    expect(mockApi.getSLOs).toHaveBeenCalledWith(
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
    
    // Verify contents contains simplified SLO data
    expect(response).toHaveLength(2);
    expect(response[0]).toHaveProperty('id', 'slo-1');
    expect(response[0]).toHaveProperty('name', 'API Availability');
    expect(response[0]).toHaveProperty('description', 'API availability target');
    expect(response[0]).toHaveProperty('time_period_days', 30);
    expect(response[0]).toHaveProperty('target_per_million', 995000);
    expect(response[0]).not.toHaveProperty('sli');
    expect(response[0]).not.toHaveProperty('created_at');
    
    expect(response[1]).toHaveProperty('id', 'slo-2');
    expect(response[1]).toHaveProperty('name', 'API Latency');
  });

  it('should handle empty SLOs list', async () => {
    // Setup API to return empty SLOs array
    mockApi.getSLOs.mockResolvedValue([]);

    const tool = createListSLOsTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify empty array is returned
    expect(response).toEqual([]);
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(404, 'Dataset not found');
    mockApi.getSLOs.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createListSLOsTool(mockApi as any);
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