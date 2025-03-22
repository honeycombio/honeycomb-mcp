import { describe, it, expect } from "vitest";
import { summarizeResults } from "./transformations.js";
import { QueryResultValue } from "../types/query.js";
import { z } from "zod";
import { QueryToolSchema } from "../types/schema.js";

describe("Response transformations", () => {
  describe("summarizeResults", () => {
    it("handles empty results", () => {
      const results: QueryResultValue[] = [];
      const params: z.infer<typeof QueryToolSchema> = { 
        environment: "test-env", 
        dataset: "test-dataset",
        calculations: [{ op: "COUNT" }] 
      };
      
      const summary = summarizeResults(results, params);
      
      expect(summary).toEqual({ count: 0 });
    });
    
    it("calculates basic count stats", () => {
      const results: QueryResultValue[] = [
        { COUNT: 5, service: "api" },
        { COUNT: 10, service: "web" },
        { COUNT: 3, service: "database" }
      ];
      
      const params: z.infer<typeof QueryToolSchema> = { 
        environment: "test-env", 
        dataset: "test-dataset",
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service"]
      };
      
      const summary = summarizeResults(results, params);
      
      expect(summary.count).toBe(3);
      if (summary.countStats) {
        expect(summary.countStats.total).toBe(18);
      }
      if (summary.breakdowns && summary.breakdowns.service) {
        expect(summary.breakdowns.service.uniqueCount).toBe(3);
      }
    });
    
    it("processes numeric calculations", () => {
      const results: QueryResultValue[] = [
        { "AVG(duration)": 150, "MAX(duration)": 300, service: "api" },
        { "AVG(duration)": 200, "MAX(duration)": 400, service: "web" }
      ];
      
      const params: z.infer<typeof QueryToolSchema> = { 
        environment: "test-env", 
        dataset: "test-dataset",
        calculations: [
          { op: "AVG", column: "duration" },
          { op: "MAX", column: "duration" }
        ],
        breakdowns: ["service"]
      };
      
      const summary = summarizeResults(results, params);
      
      expect(summary.count).toBe(2);
      
      const avgStats = summary["AVG(duration)"];
      if (avgStats && typeof avgStats !== 'number') {
        expect(avgStats.min).toBe(150);
        expect(avgStats.max).toBe(200);
      }
      
      const maxStats = summary["MAX(duration)"];
      if (maxStats && typeof maxStats !== 'number') {
        expect(maxStats.min).toBe(300);
        expect(maxStats.max).toBe(400);
      }
    });
    
    it("calculates breakdown cardinality", () => {
      const results: QueryResultValue[] = [
        { service: "api", region: "us-east" },
        { service: "api", region: "us-west" },
        { service: "web", region: "us-east" },
        { service: "database", region: "us-west" }
      ];
      
      const params: z.infer<typeof QueryToolSchema> = { 
        environment: "test-env", 
        dataset: "test-dataset",
        calculations: [{ op: "COUNT" }],
        breakdowns: ["service", "region"]
      };
      
      const summary = summarizeResults(results, params);
      
      expect(summary.count).toBe(4);
      if (summary.breakdowns) {
        if (summary.breakdowns.service) {
          expect(summary.breakdowns.service.uniqueCount).toBe(3);
        }
        if (summary.breakdowns.region) {
          expect(summary.breakdowns.region.uniqueCount).toBe(2);
        }
      }
    });
  });
});