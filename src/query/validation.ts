import { z } from "zod";
import { QueryToolSchema } from "../types/schema.js";

/**
 * Validates a query against Honeycomb API rules
 */
export function validateQuery(params: z.infer<typeof QueryToolSchema>): boolean {
  // Time parameters validation
  if (params.start_time && params.end_time && params.time_range) {
    throw new Error("Cannot specify time_range, start_time, and end_time simultaneously.");
  }

  // Check if orders reference valid operations
  if (params.orders) {
    for (const order of params.orders) {
      if (order.column && params.breakdowns && !params.breakdowns.includes(order.column) && 
          !params.calculations.some((calc: { op: string; column?: string }) => calc.column === order.column)) {
        throw new Error(`Order column '${order.column}' must be in breakdowns or calculations.`);
      }
      
      if (order.op === "HEATMAP") {
        throw new Error("HEATMAP cannot be used in orders.");
      }
      
      if (!order.column && !["COUNT", "CONCURRENCY"].includes(order.op)) {
        throw new Error(`Operation '${order.op}' requires a column unless it is COUNT or CONCURRENCY.`);
      }
    }
  }

  // Validate having clauses
  if (params.having) {
    for (const having of params.having) {
      const matchingCalculation = params.calculations.some((calc: { op: string; column?: string }) => {
        if ((calc.op === "COUNT" || calc.op === "CONCURRENCY") && 
            having.calculate_op === calc.op) {
          return true;
        }
        
        return calc.op === having.calculate_op && calc.column === having.column;
      });
      
      if (!matchingCalculation) {
        throw new Error(`HAVING clause with calculate_op '${having.calculate_op}' ${having.column ? `and column '${having.column}'` : ''} must refer to one of the calculations.`);
      }
    }
  }

  // Validate calculations
  if (params.calculations) {
    // Check if any calculation requires a column but doesn't have one
    params.calculations.forEach((calc: { op: string; column?: string }) => {
      if (
        ["SUM", "AVG", "COUNT_DISTINCT", "MAX", "MIN", "P001", "P01", "P05", "P10", "P20", "P25", "P50", "P75", "P80", "P90", "P95", "P99", "P999", "RATE_AVG", "RATE_SUM", "RATE_MAX"].includes(calc.op) &&
        !calc.column
      ) {
        throw new Error(`Calculation ${calc.op} requires a column.`);
      }
    });
  }

  // Validate orders
  if (params.orders) {
    // Check if any order references a non-existent calculation
    params.orders.forEach((order) => {
      if (order.op && order.column) {
        const matchingCalc = params.calculations?.find(
          (calc: { op: string; column?: string }) => calc.op === order.op && calc.column === order.column
        );
        if (!matchingCalc) {
          throw new Error(`Order references non-existent calculation: ${order.op} on ${order.column}`);
        }
      }
    });
  }

  return true;
}