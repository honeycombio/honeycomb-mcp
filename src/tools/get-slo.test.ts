import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetSLOTool } from './get-slo.js';
import { HoneycombError } from '../utils/errors.js';
import { SLODetailedResponse } from '../types/slo.js';

describe('get-slo tool', () => {
  // Mock API
  const mockApi = {
    getSLO: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test parameters
  const testParams = {
    environment: 'test-env',
    dataset: 'test-dataset',
    sloId: 'slo-1'
  };

  // Sample SLO detailed response
  const mockSLOResponse: SLODetailedResponse = {
    id: 'slo-1',
    name: 'API Availability',
    description: 'API availability target',
    sli: { alias: 'sli-availability' },
    time_period_days: 30,
    target_per_million: 995000,
    compliance: 0.998,
    budget_remaining: 0.85,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z'
  };

  it('should return a valid tool configuration', () => {
    const tool = createGetSLOTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'get_slo');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should return simplified SLO data when API call succeeds', async () => {
    // Setup mock API response
    mockApi.getSLO.mockResolvedValue(mockSLOResponse);

    const tool = createGetSLOTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API was called with correct parameters
    expect(mockApi.getSLO).toHaveBeenCalledWith(
      testParams.environment,
      testParams.dataset,
      testParams.sloId
    );

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify contents contains simplified SLO data
    expect(response).toHaveProperty('id', 'slo-1');
    expect(response).toHaveProperty('name', 'API Availability');
    expect(response).toHaveProperty('description', 'API availability target');
    expect(response).toHaveProperty('time_period_days', 30);
    expect(response).toHaveProperty('target_per_million', 995000);
    expect(response).toHaveProperty('compliance', 0.998);
    expect(response).toHaveProperty('budget_remaining', 0.85);
    expect(response).toHaveProperty('sli', 'sli-availability');
    expect(response).toHaveProperty('created_at');
    expect(response).toHaveProperty('updated_at');
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(404, 'SLO not found');
    mockApi.getSLO.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createGetSLOTool(mockApi as any);
      const result = await tool.handler(testParams);

      // Verify error response
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0]!.text!).toContain('Failed to execute tool');
      expect(result.content[0]!.text!).toContain('SLO not found');
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });
});