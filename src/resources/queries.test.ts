import { describe, it, expect, vi, beforeEach } from "vitest";
import { HoneycombAPI } from "../api/client.js";
import { createQueriesResource, handleQueryResource } from "./queries.js";

// Mock the API client
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => ({
      getEnvironments: vi.fn().mockReturnValue(["test-env"]),
      listDatasets: vi.fn().mockResolvedValue([
        { 
          slug: "dataset1", 
          name: "Test Dataset 1",
          description: "Description for dataset 1",
          created_at: "2023-01-01T00:00:00Z",
          last_written_at: "2023-01-02T00:00:00Z"
        }
      ]),
      getQuery: vi.fn().mockRejectedValue(new Error("API error")),
    })),
  };
});

describe("Queries Resource", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
    vi.clearAllMocks();
  });

  describe("createQueriesResource", () => {
    it("should create a resource template for queries", async () => {
      const template = createQueriesResource(api);
      expect(template).toBeDefined();
      // We can't properly test the list method in the test environment
      // Focus on testing the handler function instead
    });
  });

  describe("handleQueryResource", () => {
    it("should throw an error if environment is missing", async () => {
      await expect(handleQueryResource(api, {})).rejects.toThrow("Missing environment parameter");
    });

    it("should throw an error if dataset is missing", async () => {
      await expect(handleQueryResource(api, { environment: "test-env" })).rejects.toThrow("Missing dataset parameter");
    });

    it("should return a message about query listing not being supported", async () => {
      const result = await handleQueryResource(api, { 
        environment: "test-env", 
        dataset: "dataset1" 
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents).not.toBeNull();
      expect(result.contents!.length).toBeGreaterThan(0);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/dataset1/queries");
      expect(JSON.parse(result.contents![0].text)).toHaveProperty("message");
    });

    it("should handle query fetch errors appropriately", async () => {
      const result = await handleQueryResource(api, { 
        environment: "test-env", 
        dataset: "dataset1",
        queryId: "query1" 
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents).not.toBeNull();
      expect(result.contents!.length).toBeGreaterThan(0);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/dataset1/queries/query1");
      expect(JSON.parse(result.contents![0].text)).toHaveProperty("error");
      expect(JSON.parse(result.contents![0].text)).toHaveProperty("note");
    });
    
    it("should successfully fetch and return a query by ID", async () => {
      // Override the mock for this test
      (api.getQuery as any).mockResolvedValueOnce({
        id: "query1",
        query: {
          calculations: [{ op: "COUNT" }],
          breakdowns: ["service_name"],
          time_range: 3600
        }
      });
      
      const result = await handleQueryResource(api, { 
        environment: "test-env", 
        dataset: "dataset1",
        queryId: "query1" 
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents!.length).toBe(1);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/dataset1/queries/query1");
      
      const responseData = JSON.parse(result.contents![0].text);
      expect(responseData).toHaveProperty("id", "query1");
      expect(responseData).toHaveProperty("dataset", "dataset1");
      expect(responseData).toHaveProperty("query");
      expect(responseData.query).toHaveProperty("calculations");
      expect(responseData).toHaveProperty("execution_hint");
    });
  });
});