import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListTriggersTool } from './list-triggers.js';
import { HoneycombError } from '../utils/errors.js';
import { TriggerResponse } from '../types/trigger.js';

describe('list-triggers tool', () => {
  // Mock API
  const mockApi = {
    getTriggers: vi.fn()
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

  // Sample triggers response
  const mockTriggers: TriggerResponse[] = [
    {
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
        }
      ],
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    },
    {
      id: 'trigger-2',
      name: 'Latency Spike',
      description: 'Alert on p95 latency',
      threshold: {
        op: '>',
        value: 500
      },
      frequency: 300,
      alert_type: 'on_true',
      disabled: true,
      triggered: false,
      recipients: [
        {
          id: 'rec-2',
          type: 'slack',
          target: '#alerts'
        }
      ],
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z'
    }
  ];

  it('should return a valid tool configuration', () => {
    const tool = createListTriggersTool(mockApi as any);
    
    expect(tool).toHaveProperty('name', 'list_triggers');
    expect(tool).toHaveProperty('schema');
    expect(tool).toHaveProperty('handler');
    expect(typeof tool.handler).toBe('function');
  });

  it('should return simplified triggers when API call succeeds', async () => {
    // Setup mock API response
    mockApi.getTriggers.mockResolvedValue(mockTriggers);

    const tool = createListTriggersTool(mockApi as any);
    const result = await tool.handler(testParams);

    // Verify API was called with correct parameters
    expect(mockApi.getTriggers).toHaveBeenCalledWith(
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
    
    // Verify contents contains simplified trigger data
    expect(response).toHaveLength(2);
    
    expect(response[0]).toHaveProperty('id', 'trigger-1');
    expect(response[0]).toHaveProperty('name', 'High Error Rate');
    expect(response[0]).toHaveProperty('description', 'Alert on high error rate');
    expect(response[0]).toHaveProperty('threshold');
    expect(response[0].threshold).toHaveProperty('op', '>');
    expect(response[0].threshold).toHaveProperty('value', 0.05);
    expect(response[0]).toHaveProperty('triggered', false);
    expect(response[0]).toHaveProperty('disabled', false);
    expect(response[0]).not.toHaveProperty('recipients');
    expect(response[0]).not.toHaveProperty('created_at');
    
    expect(response[1]).toHaveProperty('id', 'trigger-2');
    expect(response[1]).toHaveProperty('name', 'Latency Spike');
  });

  it('should handle empty triggers list', async () => {
    // Setup API to return empty triggers array
    mockApi.getTriggers.mockResolvedValue([]);

    const tool = createListTriggersTool(mockApi as any);
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
    mockApi.getTriggers.mockRejectedValue(apiError);

    // Temporarily suppress console.error during this test
    const originalConsoleError = console.error;
    console.error = vi.fn();
    
    try {
      const tool = createListTriggersTool(mockApi as any);
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