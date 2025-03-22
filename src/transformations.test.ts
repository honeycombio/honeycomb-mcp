import { describe, it, expect } from "vitest";
import { summarizeResults } from "./transformations.js";

describe("Response transformations", () => {
  describe("summarizeResults", () => {
    it("handles empty results", () => {
      const results: any[] = [];
      const params = { calculations: [{ op: "COUNT" }] };
      
      const summary = summarizeResults(results, params);
      
      expect(summary).toEqual({ count: 0 });
    });
    
    it("calculates basic count stats", () => {
      const results = [
        { COUNT: 5, service: "api" },
        { COUNT: 10, service: "web" },
        { COUNT: 3, service: "database" }
      ];
      
      const params = { 
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service"]
      };
      
      const summary = summarizeResults(results, params);
      
      expect(summary.count).toBe(3);
      // Use non-null assertion to tell TypeScript we're confident these properties exist
      expect(summary.countStats!.total).toBe(18);
      expect(summary.countStats!.max).toBe(10);
      expect(summary.countStats!.min).toBe(3);
      expect(summary.countStats!.avg).toBe(6);
    });
    
    it("processes numeric calculations", () => {
      const results = [
        { "AVG(duration)": 150, "MAX(duration)": 300, service: "api" },
        { "AVG(duration)": 200, "MAX(duration)": 400, service: "web" }
      ];
      
      const params = { 
        calculations: [
          { op: "AVG", column: "duration" },
          { op: "MAX", column: "duration" }
        ],
        breakdowns: ["service"]
      };
      
      const summary = summarizeResults(results, params);
      
      expect(summary["AVG(duration)"]).toBeDefined();
      // Use type assertion to tell TypeScript about the expected type
      const avgStats = summary["AVG(duration)"] as { min: number; max: number };
      expect(avgStats.min).toBe(150);
      expect(avgStats.max).toBe(200);
      
      expect(summary["MAX(duration)"]).toBeDefined();
      // Use type assertion to tell TypeScript about the expected type
      const maxStats = summary["MAX(duration)"] as { min: number; max: number };
      expect(maxStats.min).toBe(300);
      expect(maxStats.max).toBe(400);
    });
    
    it("calculates breakdown cardinality", () => {
      const results = [
        { service: "api", region: "us-east" },
        { service: "api", region: "us-west" },
        { service: "web", region: "us-east" },
        { service: "database", region: "us-east" }
      ];
      
      const params = { 
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service", "region"]
      };
      
      const summary = summarizeResults(results, params);
      
      // First verify that breakdowns exists
      expect(summary.breakdowns).toBeDefined();
      
      // Then use type assertion to specify the exact structure we expect
      const breakdowns = summary.breakdowns as {
        service: { uniqueCount: number };
        region: { uniqueCount: number };
      };
      
      // Now TypeScript knows these properties exist
      expect(breakdowns.service.uniqueCount).toBe(3);
      expect(breakdowns.region.uniqueCount).toBe(2);
    });
  });
});