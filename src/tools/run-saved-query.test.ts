import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRunSavedQueryTool } from "./run-saved-query.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the HoneycombAPI
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => {
      return {
        listDatasets: vi.fn(),
        getQuery: vi.fn(),
        createQueryResult: vi.fn(),
        getQueryResults: vi.fn(),
        getAuthInfo: vi.fn()
      };
    }),
  };
});

describe("run-saved-query tool", () => {
  let api: HoneycombAPI;
  let runTool: ReturnType<typeof createRunSavedQueryTool>;
  
  beforeEach(() => {
    api = new HoneycombAPI({ environments: [] });
    runTool = createRunSavedQueryTool(api);
    // Silence console error output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  it("should have the correct name and schema", () => {
    expect(runTool.name).toBe("run_saved_query");
    expect(runTool.schema).toBeDefined();
  });
  
  it("should run a query and return results", async () => {
    // Mock successful path
    const mockQueryResult = { id: "result123" };
    const mockCompleteResult = {
      complete: true,
      id: "result123",
      data: {
        results: [
          { count: 42, field: "value" }
        ]
      },
      links: {
        query_url: "https://ui.honeycomb.io/team/result123"
      }
    };
    
    (api.createQueryResult as any).mockResolvedValueOnce(mockQueryResult);
    (api.getQueryResults as any).mockResolvedValueOnce(mockCompleteResult);
    
    const result = await runTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: "query123"
    });
    
    expect(api.createQueryResult).toHaveBeenCalledWith("test-env", "test-dataset", "query123");
    expect(api.getQueryResults).toHaveBeenCalledWith("test-env", "test-dataset", "result123", false);
    
    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.results).toHaveLength(1);
    expect(parsedContent.results[0].count).toBe(42);
    expect(parsedContent.query_url).toBe("https://ui.honeycomb.io/team/result123");
  });
  
  it("should handle the __all__ dataset placeholder", async () => {
    // Mock successful dataset search
    (api.listDatasets as any).mockResolvedValueOnce([
      { name: "Dataset 1", slug: "dataset1" },
      { name: "Dataset 2", slug: "dataset2" }
    ]);
    
    // Mock that the query is in the second dataset
    (api.getQuery as any).mockRejectedValueOnce(new Error("Query not found"))
                         .mockResolvedValueOnce({ id: "query123", query: {} });
    
    const mockQueryResult = { id: "result123" };
    const mockCompleteResult = {
      complete: true,
      id: "result123",
      data: {
        results: [
          { count: 42, field: "value" }
        ]
      }
    };
    
    (api.createQueryResult as any).mockResolvedValueOnce(mockQueryResult);
    (api.getQueryResults as any).mockResolvedValueOnce(mockCompleteResult);
    
    const result = await runTool.handler({
      environment: "test-env",
      dataset: "__all__", // Use the special placeholder
      queryId: "query123"
    });
    
    expect(api.listDatasets).toHaveBeenCalledWith("test-env");
    expect(api.getQuery).toHaveBeenCalledTimes(2);
    expect(api.getQuery).toHaveBeenCalledWith("test-env", "dataset2", "query123");
    expect(api.createQueryResult).toHaveBeenCalledWith("test-env", "dataset2", "query123");
    
    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.results).toHaveLength(1);
    expect(parsedContent.results[0].count).toBe(42);
  });
  
  it("should poll until query is complete", async () => {
    // Mock a query that takes multiple polls to complete
    const mockQueryResult = { id: "result123" };
    const mockIncompleteResult = {
      complete: false,
      id: "result123",
    };
    const mockCompleteResult = {
      complete: true,
      id: "result123",
      data: {
        results: [
          { count: 42, field: "value" }
        ]
      }
    };
    
    (api.createQueryResult as any).mockResolvedValueOnce(mockQueryResult);
    (api.getQueryResults as any)
      .mockResolvedValueOnce(mockIncompleteResult)
      .mockResolvedValueOnce(mockIncompleteResult)
      .mockResolvedValueOnce(mockCompleteResult);
    
    // Mock setTimeout to execute immediately
    vi.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0 as any;
    });
    
    const result = await runTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: "query123"
    });
    
    expect(api.getQueryResults).toHaveBeenCalledTimes(3);
    
    const parsedContent = JSON.parse(result.content[0].text);
    expect(parsedContent.results).toHaveLength(1);
    
    vi.restoreAllMocks();
  });
  
  it("should handle query timeout gracefully", async () => {
    // Reset mocks for this test
    vi.clearAllMocks();
    api = new HoneycombAPI({ environments: [] });
    runTool = createRunSavedQueryTool(api);
    
    // Mock a query that never completes
    const mockQueryResult = { id: "result123" };
    const mockIncompleteResult = {
      complete: false,
      id: "result123",
    };
    
    (api.createQueryResult as any) = vi.fn().mockResolvedValueOnce(mockQueryResult);
    (api.getQueryResults as any) = vi.fn().mockResolvedValue(mockIncompleteResult);
    
    // Mock setTimeout to execute immediately
    vi.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0 as any;
    });
    
    const result = await runTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: "query123",
      maxAttempts: 3 // Set a small number of attempts for testing
    }) as any;
    
    expect(api.getQueryResults).toHaveBeenCalledTimes(3);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Query execution timed out");
    
    vi.restoreAllMocks();
  });
});