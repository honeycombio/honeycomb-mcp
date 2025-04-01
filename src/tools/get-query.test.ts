import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGetQueryTool } from "./get-query.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the HoneycombAPI
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => {
      return {
        getQuery: vi.fn(),
        getQueryAnnotation: vi.fn(),
      };
    }),
  };
});

describe("get-query tool", () => {
  let api: HoneycombAPI;
  let getTool: ReturnType<typeof createGetQueryTool>;
  
  beforeEach(() => {
    api = new HoneycombAPI({ environments: [] });
    getTool = createGetQueryTool(api);
  });
  
  it("should have the correct name and schema", () => {
    expect(getTool.name).toBe("get_query");
    expect(getTool.schema).toBeDefined();
  });
  
  it("should return query data when successful", async () => {
    const mockQuery = {
      id: "abc123",
      query: {
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service.name"],
        time_range: 3600
      }
    };
    
    const mockAnnotation = {
      id: "anno123",
      name: "My Test Query",
      description: "A description of the test query",
      query_id: "abc123"
    };
    
    (api.getQuery as any).mockResolvedValueOnce(mockQuery);
    (api.getQueryAnnotation as any).mockResolvedValueOnce(mockAnnotation);
    
    const result = await getTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: "abc123"
    });
    
    expect(api.getQuery).toHaveBeenCalledWith("test-env", "test-dataset", "abc123");
    expect(api.getQueryAnnotation).toHaveBeenCalledWith("test-env", "test-dataset", "abc123");
    expect(result.content[0].text).toContain("abc123");
    
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult).toEqual({
      id: "abc123",
      dataset: "test-dataset",
      query: {
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service.name"],
        time_range: 3600
      },
      name: "My Test Query",
      description: "A description of the test query"
    });
  });
  
  it("should return query data without annotations when they are not available", async () => {
    const mockQuery = {
      id: "abc123",
      query: {
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service.name"],
        time_range: 3600
      }
    };
    
    (api.getQuery as any).mockResolvedValueOnce(mockQuery);
    (api.getQueryAnnotation as any).mockResolvedValueOnce(null);
    
    const result = await getTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: "abc123"
    });
    
    expect(api.getQuery).toHaveBeenCalledWith("test-env", "test-dataset", "abc123");
    expect(result.content[0].text).toContain("abc123");
    
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult).toEqual({
      id: "abc123",
      dataset: "test-dataset",
      query: {
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service.name"],
        time_range: 3600
      }
    });
    expect(parsedResult.name).toBeUndefined();
    expect(parsedResult.description).toBeUndefined();
  });
  
  it("should handle errors properly", async () => {
    (api.getQuery as any).mockRejectedValueOnce(new Error("API Error"));
    
    const result = await getTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: "abc123"
    }) as any;
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to execute tool 'get_query'");
  });
  
  it("should validate required parameters", async () => {
    // Test missing environment
    let result = await getTool.handler({
      environment: "",
      dataset: "test-dataset",
      queryId: "abc123"
    }) as any;
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("environment parameter is required");
    
    // Test missing dataset
    result = await getTool.handler({
      environment: "test-env",
      dataset: "",
      queryId: "abc123"
    }) as any;
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("dataset parameter is required");
    
    // Test missing queryId
    result = await getTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      queryId: ""
    }) as any;
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("queryId parameter is required");
  });
});