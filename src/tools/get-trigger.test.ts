import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGetTriggerTool } from './get-trigger.js';
import { HoneycombError } from '../utils/errors.js';
import { TriggerResponse } from '../types/trigger.js';

describe('get-trigger tool', () => {
  // Mock API
  const mockApi = {
    getTrigger: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test parameters
  const testParams = {
    environment: 'test-env',
    dataset: 'test-dataset',
    triggerId: 'trigger-1'
  };

  // Sample trigger response
  const mockTriggerResponse: TriggerResponse = {
    id: 'trigger-1',
    name: 'High Error Rate',
    description: 'Alert on high error rate',
    threshold: {
      op: '>',
      value: 0.05
    },
    frequency: 60,
    alert_type: 'on_change',
    disabled: false,
    triggered: false,
    recipients: [
      {
        id: 'rec-1',
        type: 'email',
        target: 'team@example.com'
      },
      {
        id: 'rec-2',
        type: 'slack',
        target: '#alerts'
      }
    ],
    evaluation_schedule_type: 'frequency',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z'
  };

  it('should return a valid tool configuration', () => {
    const tool = createGetTriggerTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'get_trigger');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should return simplified trigger data when API call succeeds', async () => {
    // Setup mock API response
    mockApi.getTrigger.mockResolvedValue(mockTriggerResponse);

    const tool = createGetTriggerTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API was called with correct parameters
    expect(mockApi.getTrigger).toHaveBeenCalledWith(
      testParams.environment,
      testParams.dataset,
      testParams.triggerId
    );

    // Check response structure
    expect(result).toHaveProperty('content');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toBeDefined();
    expect(result.content[0]).toHaveProperty('type', 'text');
    
    // Parse the JSON response
    const response = JSON.parse(result.content[0]!.text!);
    
    // Verify contents contains simplified trigger data
    expect(response).toHaveProperty('id', 'trigger-1');
    expect(response).toHaveProperty('name', 'High Error Rate');
    expect(response).toHaveProperty('description', 'Alert on high error rate');
    expect(response).toHaveProperty('threshold');
    expect(response.threshold).toHaveProperty('op', '>');
    expect(response.threshold).toHaveProperty('value', 0.05);
    expect(response).toHaveProperty('frequency', 60);
    expect(response).toHaveProperty('alert_type', 'on_change');
    expect(response).toHaveProperty('triggered', false);
    expect(response).toHaveProperty('disabled', false);
    
    // Check recipients
    expect(response).toHaveProperty('recipients');
    expect(response.recipients).toHaveLength(2);
    expect(response.recipients[0]).toHaveProperty('type', 'email');
    expect(response.recipients[0]).toHaveProperty('target', 'team@example.com');
    expect(response.recipients[1]).toHaveProperty('type', 'slack');
    expect(response.recipients[1]).toHaveProperty('target', '#alerts');
    
    expect(response).toHaveProperty('evaluation_schedule_type', 'frequency');
    expect(response).toHaveProperty('created_at');
    expect(response).toHaveProperty('updated_at');
  });

  it('should handle API errors', async () => {
    // Setup API to throw an error
    const apiError = new HoneycombError(404, 'Trigger not found');
    mockApi.getTrigger.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createGetTriggerTool(mockApi as any);
      const result = await tool.handler(testParams);

      // Verify error response
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toBeDefined();
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0]!.text!).toContain('Failed to execute tool');
      expect(result.content[0]!.text!).toContain('Trigger not found');
    } finally {
      // Restore original console.error
      console.error = originalConsoleError;
    }
  });
});