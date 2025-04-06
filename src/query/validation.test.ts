import { describe, it, expect } from "vitest";
import { validateQuery } from "./validation.js";
import { QueryCalculationSchema, OrderDirectionSchema, HavingSchema } from "../types/schema.js";
import { z } from "zod";

// Define types for the various enums to ensure type safety
type CalculationOp = z.infer<typeof QueryCalculationSchema>["op"];
type OrderDirection = z.infer<typeof OrderDirectionSchema>;
type HavingOp = z.infer<typeof HavingSchema>["op"];
type HavingCalculateOp = z.infer<typeof HavingSchema>["calculate_op"];

describe("Query validation", () => {
  describe("Time parameters", () => {
    it("allows time_range alone", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        time_range: 3600
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("allows start_time and end_time together", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        start_time: 1672531200, // 2023-01-01 as timestamp
        end_time: 1672617600    // 2023-01-02 as timestamp
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("allows time_range with start_time", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        time_range: 3600,
        start_time: 1672531200  // 2023-01-01 as timestamp
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("allows time_range with end_time", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        time_range: 3600,
        end_time: 1672617600    // 2023-01-02 as timestamp
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("rejects time_range, start_time, and end_time together", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        time_range: 3600,
        start_time: 1672531200, // 2023-01-01 as timestamp
        end_time: 1672617600    // 2023-01-02 as timestamp
      };

      expect(() => validateQuery(params)).toThrow();
    });
  });

  describe("Orders validation", () => {
    it("validates orders reference valid breakdowns", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        breakdowns: ["service", "duration"],
        orders: [{ column: "service", order: "ascending" as OrderDirection }]
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("validates orders reference valid calculations", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [
          { op: "COUNT" as CalculationOp },
          { op: "AVG" as CalculationOp, column: "duration" }
        ],
        orders: [{ column: "duration", op: "AVG" as CalculationOp, order: "descending" as OrderDirection }]
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("rejects orders with invalid column references", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        breakdowns: ["service"],
        orders: [{ column: "invalid_field", order: "ascending" as OrderDirection }]
      };

      expect(() => validateQuery(params)).toThrow();
    });

    it("rejects HEATMAP in orders", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "HEATMAP" as CalculationOp, column: "duration" }],
        orders: [{ column: "duration", op: "HEATMAP" as CalculationOp, order: "descending" as OrderDirection }]
      };

      expect(() => validateQuery(params)).toThrow();
    });
  });

  describe("Having clause validation", () => {
    it("validates havings clauses reference valid calculations", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [
          { op: "COUNT" as CalculationOp },
          { op: "AVG" as CalculationOp, column: "duration" }
        ],
        havings: [
          { calculate_op: "AVG" as HavingCalculateOp, column: "duration", op: ">" as HavingOp, value: 100 }
        ]
      };

      expect(() => validateQuery(params)).not.toThrow();
    });

    it("rejects havings clauses with invalid calculation references", () => {
      const params = {
        environment: "prod",
        dataset: "test",
        calculations: [{ op: "COUNT" as CalculationOp }],
        havings: [
          { calculate_op: "P99" as HavingCalculateOp, column: "duration", op: ">" as HavingOp, value: 100 }
        ]
      };

      expect(() => validateQuery(params)).toThrow();
    });
  });
});