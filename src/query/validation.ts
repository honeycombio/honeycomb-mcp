import { z } from "zod";
import { QueryToolSchema } from "../types/schema.js";
import { QueryError } from "../utils/errors.js";

function validateTimeParameters(params: z.infer<typeof QueryToolSchema>): void {
  // Most basic validation is now handled by the Zod schema refinements
  // This function now focuses on more complex validation rules
  
  // DA RULEZ:
  // 
  // A range of time need not exist (it will default to 2hrs).
  //
  // If a time range exists, it can be one of:
  // - time_range
  // - start_time and end_time
  // - time_range and start_time
  // - time_range and end_time
  //
  // A granularity may be specified, but it is not required.
  // If it's 0, it will default to "auto", same as unspecified.
  // A non-0 valid granularity is, for the time span T, between T/10 and T/1000.
  
  const { time_range, start_time, end_time, granularity } = params;
  let explicitTimeSpan: number | undefined;
  const hasTimeRange = time_range !== undefined;
  const hasStartTime = start_time !== undefined;
  const hasEndTime = end_time !== undefined;

  // Check if all three time parameters are specified, which is invalid
  if (hasTimeRange && hasStartTime && hasEndTime) {
    throw new QueryError(
      "Cannot specify time_range, start_time, and end_time together",
      [
        "Use either time_range alone",
        "Or start_time and end_time together",
        "Or time_range with either start_time or end_time"
      ]
    );
  }
  
  if (hasTimeRange) {
    explicitTimeSpan = time_range;
    if (hasStartTime) {
      explicitTimeSpan = start_time + time_range;
    } else if (hasEndTime) {
      explicitTimeSpan = end_time - time_range;
    }  
  } else if (hasStartTime && hasEndTime) {
    // Both start_time and end_time exist
    explicitTimeSpan = end_time - start_time;
    // The negative time range check is now handled by Zod schema refinements
  }
  
  // Validate granularity if specified
  if (granularity !== undefined && granularity != 0 && explicitTimeSpan) {
    const minGranularity = explicitTimeSpan / 1000;
    const maxGranularity = explicitTimeSpan / 10;
    
    if (granularity < minGranularity || granularity > maxGranularity) {
      throw new QueryError(
        `Invalid granularity: ${granularity} is outside the valid range of ${minGranularity} to ${maxGranularity}`,
        [
          `Granularity must be between ${minGranularity} and ${maxGranularity} for the given time span`,
          `For this time span (${explicitTimeSpan}), granularity should be between ${Math.ceil(minGranularity)} and ${Math.floor(maxGranularity)}`
        ]
      );
    }
  }
}

/**
 * Validates a query against Honeycomb API rules
 */
export function validateQuery(params: z.infer<typeof QueryToolSchema>): boolean {
  // Time parameters validation
  validateTimeParameters(params);

  // Add default calculations if none are provided
  if (!params.calculations) {
    params.calculations = [{ op: "COUNT" }];
  }

  // Check if orders reference valid operations
  if (params.orders) {
    for (const order of params.orders) {
      // Check if column exists in breakdowns or calculations
      if (order.column && params.breakdowns && !params.breakdowns.includes(order.column) && 
          !params.calculations.some((calc: { op: string; column?: string }) => calc.column === order.column)) {
        throw new QueryError(
          `Order column '${order.column}' must be in breakdowns or calculations.`,
          [
            `Add '${order.column}' to your breakdowns list`,
            `Or add a calculation that uses '${order.column}'`
          ]
        );
      }
      
      // Prevent using HEATMAP in orders
      if (order.op === "HEATMAP") {
        throw new QueryError(
          "HEATMAP cannot be used in orders.",
          ["Remove the HEATMAP operation from orders or replace it with a different operation"]
        );
      }
      
      // Ensure column is present for operations that require it, except when sorting by breakdown column directly
      if (order.op && !order.column && !["COUNT", "CONCURRENCY"].includes(order.op)) {
        throw new QueryError(
          `Operation '${order.op}' requires a column unless it is COUNT or CONCURRENCY.`,
          [
            `Specify a column for the '${order.op}' operation`,
            `Or change the operation to COUNT or CONCURRENCY if no column is needed`
          ]
        );
      }
    }
  }

  // Validate havings clauses
  if (params.havings) {
    for (const having of params.havings) {
      const matchingCalculation = params.calculations.some((calc: { op: string; column?: string }) => {
        if ((calc.op === "COUNT" || calc.op === "CONCURRENCY") && 
            having.calculate_op === calc.op) {
          return true;
        }
        
        return calc.op === having.calculate_op && calc.column === having.column;
      });
      
      if (!matchingCalculation) {
        throw new QueryError(
          `HAVINGS clause with calculate_op '${having.calculate_op}' ${having.column ? `and column '${having.column}'` : ''} must refer to one of the calculations.`,
          [
            "Ensure your HAVINGS clause references a calculation defined in your query",
            "Add the missing calculation to your query"
          ]
        );
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
        throw new QueryError(
          `Calculation ${calc.op} requires a column.`,
          [
            `Provide a column name for the ${calc.op} calculation`,
            "Choose a column that is relevant for this aggregation operation",
            `INCORRECT: {"op": "${calc.op}"}`,
            `CORRECT: {"op": "${calc.op}", "column": "duration_ms"}`
          ]
        );
      }
      
      // Check if COUNT or CONCURRENCY incorrectly have a column specified
      if (
        ["COUNT", "CONCURRENCY"].includes(calc.op) &&
        calc.column
      ) {
        throw new QueryError(
          `Calculation ${calc.op} must NOT have a column.`,
          [
            `Remove the column attribute from the ${calc.op} operation`,
            `The ${calc.op} operation counts all events, not values in a column`,
            `INCORRECT: {"op": "${calc.op}", "column": "${calc.column}"}`,
            `CORRECT: {"op": "${calc.op}"}`
          ]
        );
      }
    });
  }

  // Validate orders match calculations when both op and column are specified
  if (params.orders) {
    // Check if any order references a non-existent calculation
    params.orders.forEach((order) => {
      // Only validate orders that specify both op and column for a calculation
      if (order.op && order.column) {
        // Skip validation when the column is in breakdowns (directly sortable)
        if (params.breakdowns?.includes(order.column)) {
          return;
        }
        
        const matchingCalc = params.calculations?.find(
          (calc: { op: string; column?: string }) => calc.op === order.op && calc.column === order.column
        );
        if (!matchingCalc) {
          throw new QueryError(
            `Order references non-existent calculation: ${order.op} on ${order.column}`,
            [
              `Add a calculation with operation ${order.op} on column ${order.column}`,
              "Or update your order to reference an existing calculation"
            ]
          );
        }
      }
    });
  }

  return true;
}