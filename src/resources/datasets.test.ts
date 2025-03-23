import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleDatasetResource } from './datasets.js';

// We'll skip testing the resourceTemplate creation directly since it uses 
// an external library that's hard to mock in these tests. Instead, we'll 
// test the functionality by testing the handleDatasetResource function
// which contains the actual logic.

describe('datasets resource', () => {
  // Mock API
  const mockApi = {
    getEnvironments: vi.fn(),
    listDatasets: vi.fn(),
    getDataset: vi.fn(),
    getVisibleColumns: vi.fn()
  };

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });
  
  describe('handleDatasetResource', () => {
    const mockUri = new URL('honeycomb://test-env/test-dataset');
    const mockParams = { environment: 'test-env', dataset: 'test-dataset' };
    
    it('should fetch and format specific dataset with columns', async () => {
      // Setup mock API responses
      mockApi.getDataset.mockResolvedValue({
        name: 'Test Dataset',
        slug: 'test-dataset',
        description: 'A test dataset'
      });
      
      mockApi.getVisibleColumns.mockResolvedValue([
        {
          key_name: 'column1',
          type: 'string',
          description: 'First column',
          hidden: false
        },
        {
          key_name: 'column2',
          type: 'integer',
          description: null,
          hidden: false
        },
        {
          key_name: 'hidden_column',
          type: 'string',
          description: 'Should be filtered out',
          hidden: true
        }
      ]);
      
      const result = await handleDatasetResource(mockApi as any, mockUri, mockParams);
      
      // Verify result structure
      expect(result).toHaveProperty('contents');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toHaveProperty('mimeType', 'application/json');
      expect(result.contents[0]).toHaveProperty('uri', mockUri.href);
      
      // Parse and check the JSON content
      const content = JSON.parse(result.contents[0]!.text!);
      expect(content).toHaveProperty('name', 'Test Dataset');
      expect(content).toHaveProperty('columns');
      
      // Should only include non-hidden columns
      expect(content.columns).toHaveLength(2);
      expect(content.columns[0]).toHaveProperty('name', 'column1');
      expect(content.columns[1]).toHaveProperty('description', '');  // Empty string for null
      
      // Should not include the hidden column
      const hasHiddenColumn = content.columns.some((col: { name: string }) => col.name === 'hidden_column');
      expect(hasHiddenColumn).toBe(false);
    });
    
    it('should list all datasets in an environment when no dataset is specified', async () => {
      const paramsWithoutDataset = { environment: 'test-env', dataset: '' };
      
      // Setup mock API response
      mockApi.listDatasets.mockResolvedValue([
        { name: 'Dataset1', slug: 'dataset1', description: 'First dataset' },
        { name: 'Dataset2', slug: 'dataset2', description: null }
      ]);
      
      const result = await handleDatasetResource(mockApi as any, mockUri, paramsWithoutDataset);
      
      // Verify result structure
      expect(result).toHaveProperty('contents');
      expect(result.contents).toHaveLength(2);
      
      // Check first dataset
      const firstDataset = JSON.parse(result.contents[0]!.text!);
      expect(firstDataset).toHaveProperty('name', 'Dataset1');
      expect(firstDataset).toHaveProperty('slug', 'dataset1');
      
      // Check second dataset - null description should be converted to empty string
      const secondDataset = JSON.parse(result.contents[1]!.text!);
      expect(secondDataset).toHaveProperty('description', '');
    });
    
    it('should handle API errors', async () => {
      // Setup API to throw an error
      mockApi.getDataset.mockRejectedValue(new Error('Dataset not found'));
      
      // Expect the function to throw
      await expect(handleDatasetResource(mockApi as any, mockUri, mockParams))
        .rejects.toThrow('Failed to read dataset');
    });
  });
});