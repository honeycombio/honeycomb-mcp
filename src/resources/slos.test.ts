import { describe, it, expect, vi, beforeEach } from "vitest";
import { HoneycombAPI } from "../api/client.js";
import { createSLOsResource, handleSLOResource } from "./slos.js";
import { SLO, SLODetailedResponse } from "../types/slo.js";

// Mock SLO data
const mockSLOs: SLO[] = [
  {
    id: "slo1",
    name: "API Availability",
    description: "SLO for API availability",
    sli: { alias: "availability" },
    time_period_days: 30,
    target_per_million: 995000, // 99.5%
    created_at: "2023-01-01T00:00:00Z",
    updated_at: "2023-01-02T00:00:00Z"
  }
];

const mockSLODetailed: SLODetailedResponse = {
  id: "slo1",
  name: "API Availability",
  description: "SLO for API availability",
  sli: { alias: "availability" },
  time_period_days: 30,
  target_per_million: 995000, // 99.5%
  created_at: "2023-01-01T00:00:00Z",
  updated_at: "2023-01-02T00:00:00Z",
  compliance: 0.998,
  budget_remaining: 0.7
};

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
      getSLOs: vi.fn().mockResolvedValue(mockSLOs),
      getSLO: vi.fn().mockResolvedValue(mockSLODetailed)
    })),
  };
});

describe("SLOs Resource", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
    vi.clearAllMocks();
  });

  describe("createSLOsResource", () => {
    it("should create a resource template for SLOs", async () => {
      const template = createSLOsResource(api);
      expect(template).toBeDefined();
      // We can't properly test the list method in the test environment
      // Focus on testing the handler function instead
    });
  });

  describe("handleSLOResource", () => {
    it("should throw an error if environment is missing", async () => {
      await expect(handleSLOResource(api, {})).rejects.toThrow("Missing environment parameter");
    });

    it("should throw an error if dataset is missing", async () => {
      await expect(handleSLOResource(api, { environment: "test-env" })).rejects.toThrow("Missing dataset parameter");
    });

    it("should return a list of SLOs for a dataset", async () => {
      const result = await handleSLOResource(api, { 
        environment: "test-env", 
        dataset: "dataset1" 
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents).not.toBeNull();
      expect(result.contents!.length).toBeGreaterThan(0);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/dataset1/slos/slo1");
      
      const slo = JSON.parse(result.contents![0].text);
      expect(slo).toMatchObject({
        id: "slo1",
        name: "API Availability",
        target_percentage: 99.5, // Converted to percentage
      });
    });

    it("should return detailed SLO information when an SLO ID is provided", async () => {
      const result = await handleSLOResource(api, { 
        environment: "test-env", 
        dataset: "dataset1",
        sloId: "slo1" 
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents).not.toBeNull();
      expect(result.contents!.length).toBeGreaterThan(0);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/dataset1/slos/slo1");
      
      const slo = JSON.parse(result.contents![0].text);
      expect(slo).toMatchObject({
        id: "slo1",
        name: "API Availability",
        target_percentage: 99.5,
        compliance: 0.998,
        budget_remaining: 0.7
      });
    });
  });
});