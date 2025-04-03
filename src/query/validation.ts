import { z } from "zod";
import { QueryToolSchema } from "../types/schema.js";
import { QueryError } from "../utils/errors.js";

function validateTimeParameters(params: z.infer<typeof QueryToolSchema>): void {
  // THE RULES:
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

  if (hasTimeRange && hasStartTime && hasEndTime) {
    throw new QueryError(
      "Invalid time parameters: time_range, start_time, and end_time cannot all be specified together",
      ["Only one of time_range, time range and start_time, or time range and end_time can be specified"]
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
    
    if (explicitTimeSpan <= 0) {
      throw new QueryError(
        "Invalid time parameters: negative time range",
        ["Ensure that end_time is after start_time"]
      );
    }
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

  // Check if orders reference valid operations
  if (params.orders) {
    for (const order of params.orders) {
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
      
      if (order.op === "HEATMAP") {
        throw new QueryError(
          "HEATMAP cannot be used in orders.",
          ["Remove the HEATMAP operation from orders or replace it with a different operation"]
        );
      }
      
      if (!order.column && !["COUNT", "CONCURRENCY"].includes(order.op)) {
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
        throw new QueryError(
          `HAVING clause with calculate_op '${having.calculate_op}' ${having.column ? `and column '${having.column}'` : ''} must refer to one of the calculations.`,
          [
            "Ensure your HAVING clause references a calculation defined in your query",
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
            "Choose a column that is relevant for this aggregation operation"
          ]
        );
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