import { describe, it, expect } from "vitest";
import { calculateStdDev, getTopValues } from "./functions.js";
import { QueryResultValue } from "../types/query.js";

describe("Helper functions", () => {
  describe("calculateStdDev", () => {
    it("calculates standard deviation correctly", () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const result = calculateStdDev(values, mean);
      expect(result).toBeCloseTo(2.0);
    });

    it("returns 0 for single value array", () => {
      const values = [5];
      const result = calculateStdDev(values, 5);
      expect(result).toBe(0);
    });

    it("returns 0 for empty array", () => {
      const values: number[] = [];
      const result = calculateStdDev(values, 0);
      expect(result).toBe(0);
    });
  });

  describe("getTopValues", () => {
    it("returns top values sorted by frequency", () => {
      const results: QueryResultValue[] = [
        { fruit: "apple", count: 5 },
        { fruit: "banana", count: 2 },
        { fruit: "apple", count: 6 },
        { fruit: "cherry", count: 1 },
        { fruit: "banana", count: 3 },
        { fruit: "apple", count: 7 },
      ];
      
      const topValues = getTopValues(results, "fruit", 2);
      
      // First verify the array has the expected length
      expect(topValues).toHaveLength(2);
      
      // Then verify each element exists and has the expected properties
      const firstItem = topValues[0];
      const secondItem = topValues[1];
      
      // Use type assertions to tell TypeScript these objects exist
      expect(firstItem).toBeDefined();
      expect(secondItem).toBeDefined();
      
      // Now safely access their properties
      expect(firstItem!.value).toBe("apple");
      expect(firstItem!.count).toBe(3);
      expect(secondItem!.value).toBe("banana");
      expect(secondItem!.count).toBe(2);
    });
    
    it("handles empty results", () => {
      const results: QueryResultValue[] = [];
      const topValues = getTopValues(results, "column", 5);
      expect(topValues).toHaveLength(0);
    });

    it("handles null values", () => {
      // Updated to only use null (not undefined) to match QueryResultValue type
      const results: QueryResultValue[] = [
        { val: "a" },
        { val: null },
        { val: "b" },
        { val: null },  // Changed from undefined to null
        { val: "a" },
      ];
      
      const topValues = getTopValues(results, "val");
      
      // First verify the array has the expected length
      expect(topValues).toHaveLength(2);
      
      // Then verify the first element exists
      const firstItem = topValues[0];
      expect(firstItem).toBeDefined();
      
      // Now safely access its properties
      expect(firstItem!.value).toBe("a");
      expect(firstItem!.count).toBe(2);
    });
  });
});