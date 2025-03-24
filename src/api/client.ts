import { z } from "zod";
import {
  QueryResult,
  AnalysisQuery,
  QueryCalculation,
} from "../types/query.js";
import { QueryToolSchema, ColumnAnalysisSchema } from "../types/schema.js";
import { HoneycombError } from "../utils/errors.js";
import { Column } from "../types/column.js";
import { Dataset } from "../types/api.js";
import { SLO, SLODetailedResponse } from "../types/slo.js";
import { TriggerResponse } from "../types/trigger.js";
import { QueryOptions } from "../types/api.js";
import { Board, BoardsResponse } from "../types/board.js";
import { Marker, MarkersResponse } from "../types/marker.js";
import { Recipient, RecipientsResponse } from "../types/recipient.js";
import { Config } from "../config.js";

export class HoneycombAPI {
  private environments: Map<string, { apiKey: string }>;

  constructor(config: Config) {
    this.environments = new Map(
      config.environments.map(env => [env.name, { apiKey: env.apiKey }])
    );
  }

  getEnvironments(): string[] {
    return Array.from(this.environments.keys());
  }

  private getApiKey(environment: string): string {
    const env = this.environments.get(environment);
    if (!env) {
      throw new Error(
        `Unknown environment: "${environment}". Available environments: ${Array.from(this.environments.keys()).join(", ")}`
      );
    }
    return env.apiKey;
  }

  private async request<T>(
    environment: string,
    path: string,
    options: RequestInit & { params?: Record<string, any> } = {},
  ): Promise<T> {
    const apiKey = this.getApiKey(environment);
    const { params, ...requestOptions } = options;

    let url = `https://api.honeycomb.io${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
      ...requestOptions,
      headers: {
        "X-Honeycomb-Team": apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new HoneycombError(
        response.status,
        `Honeycomb API error: ${response.statusText}`,
      );
    }

    // Parse the response as JSON and validate it before returning
    const data = await response.json();
    return data as T;
  }

  // Dataset methods
  async getDataset(environment: string, datasetSlug: string): Promise<Dataset> {
    return this.request(environment, `/1/datasets/${datasetSlug}`);
  }

  async listDatasets(environment: string): Promise<Dataset[]> {
    return this.request(environment, "/1/datasets");
  }

  // Query methods
  async createQuery(
    environment: string,
    datasetSlug: string,
    query: AnalysisQuery,
  ): Promise<{ id: string }> {
    const apiKey = this.getApiKey(environment);
    return this.request<{ id: string }>(
      environment,
      `/1/queries/${datasetSlug}`,
      {
        method: "POST",
        body: JSON.stringify(query),
      },
    );
  }

  async createQueryResult(
    environment: string,
    datasetSlug: string,
    queryId: string,
  ): Promise<{ id: string }> {
    const apiKey = this.getApiKey(environment);
    return this.request<{ id: string }>(
      environment,
      `/1/query_results/${datasetSlug}`,
      {
        method: "POST",
        body: JSON.stringify({ query_id: queryId }),
      },
    );
  }

  async getQueryResults(
    environment: string,
    datasetSlug: string,
    queryResultId: string,
    includeSeries: boolean = false,
  ): Promise<QueryResult> {
    const response = await this.request<QueryResult>(
      environment,
      `/1/query_results/${datasetSlug}/${queryResultId}`,
      {
        params: {
          include_series: includeSeries,
        },
      },
    );

    if (!includeSeries && response.data) {
      const { series, ...rest } = response.data;
      response.data = rest;
    }

    return response;
  }

  async queryAndWaitForResults(
    environment: string,
    datasetSlug: string,
    query: AnalysisQuery,
    maxAttempts = 10,
    options: QueryOptions = {},
  ): Promise<QueryResult> {
    const defaultLimit = 100;
    const queryWithLimit = {
      ...query,
      limit: query.limit || options.limit || defaultLimit,
    };
    const queryResponse = await this.createQuery(
      environment,
      datasetSlug,
      queryWithLimit,
    );
    const queryId = queryResponse.id;

    const queryResult = await this.createQueryResult(
      environment,
      datasetSlug,
      queryId,
    );
    const queryResultId = queryResult.id;

    let attempts = 0;
    while (attempts < maxAttempts) {
      const results = await this.getQueryResults(
        environment,
        datasetSlug,
        queryResultId,
        options.includeSeries,
      );
      if (results.complete) {
        return results;
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Query timed out waiting for results");
  }

  // Column methods
  async getColumns(
    environment: string,
    datasetSlug: string,
  ): Promise<Column[]> {
    return this.request(environment, `/1/columns/${datasetSlug}`);
  }

  async getColumnByName(
    environment: string,
    datasetSlug: string,
    keyName: string,
  ): Promise<Column> {
    return this.request(
      environment,
      `/1/columns/${datasetSlug}?key_name=${encodeURIComponent(keyName)}`,
    );
  }

  async getVisibleColumns(
    environment: string,
    datasetSlug: string,
  ): Promise<Column[]> {
    const columns = await this.getColumns(environment, datasetSlug);
    return columns.filter((column) => !column.hidden);
  }

  async runAnalysisQuery(
    environment: string,
    datasetSlug: string,
    params: z.infer<typeof QueryToolSchema>,
  ) {
    // Build the query with enhanced validation based on specs
    const query: AnalysisQuery = {
      calculations: params.calculations,
      breakdowns: params.breakdowns || [],
      filters: params.filters,
      filter_combination: params.filter_combination,
      orders: params.orders,
      limit: params.limit,
      having: params.having,
      
      // Time-related parameters
      // The prompt.txt spec notes that time_range is relative and can be 
      // combined with either start_time or end_time but not both
      time_range: params.time_range,
      start_time: params.start_time,
      end_time: params.end_time,
      granularity: params.granularity,
    };

    try {
      // For complex queries, we should increase the default limit if not specified
      const defaultLimit = 100; 
      const queryWithLimit = {
        ...query,
        limit: query.limit || defaultLimit,
      };

      // Cleanup: Remove undefined parameters to avoid API validation errors
      Object.keys(queryWithLimit).forEach(key => {
        const typedKey = key as keyof typeof queryWithLimit;
        if (queryWithLimit[typedKey] === undefined) {
          delete queryWithLimit[typedKey];
        }
      });

      const results = await this.queryAndWaitForResults(
        environment,
        datasetSlug,
        queryWithLimit,
      );
      
      return {
        data: {
          results: results.data?.results || [],
          series: results.data?.series || [],
        },
        links: results.links,
      };
    } catch (error) {
      // Provide more specific error messages for common API errors
      if (error instanceof HoneycombError) {
        if (error.statusCode === 422) {
          // Unprocessable Entity - likely parameter validation issues
          let errorMessage = "Query validation failed: ";
          
          // Check for common issues with granularity
          if (params.granularity !== undefined) {
            errorMessage += "The granularity parameter might be causing issues. Try: ";
            errorMessage += "\n1. Ensure you're specifying a time window (time_range or start_time+end_time)";
            errorMessage += "\n2. Make sure granularity value isn't too small for your time window";
            errorMessage += "\n3. Consider removing granularity and other advanced parameters for a simpler query first";
          } else {
            errorMessage += "Try simplifying your query parameters";
          }
          
          throw new Error(errorMessage);
        }
      }
      
      // Default error message
      throw new Error(
        `Analysis query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async analyzeColumn(
    environment: string,
    datasetSlug: string,
    params: z.infer<typeof ColumnAnalysisSchema>,
  ) {
    const column = await this.getColumnByName(
      environment,
      datasetSlug,
      params.column,
    );

    const query: AnalysisQuery = {
      calculations: [{ op: "COUNT" }],
      breakdowns: [params.column],
      time_range: params.timeRange || 3600,
      orders: [
        {
          op: "COUNT",
          order: "descending",
        },
      ],
      limit: 10,
    };

    if (column.type === "integer" || column.type === "float") {
      const numericCalculations: QueryCalculation[] = [
        { op: "AVG", column: params.column },
        { op: "P95", column: params.column },
        { op: "MAX", column: params.column },
        { op: "MIN", column: params.column },
      ];
      query.calculations.push(...numericCalculations);
    }

    try {
      const results = await this.queryAndWaitForResults(
        environment,
        datasetSlug,
        query,
      );
      return {
        data: {
          results: results.data?.results || [],
          series: results.data?.series || [],
        },
        links: results.links,
      };
    } catch (error) {
      throw new Error(
        `Column analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getSLOs(environment: string, datasetSlug: string): Promise<SLO[]> {
    return this.request<SLO[]>(environment, `/1/slos/${datasetSlug}`);
  }

  async getSLO(
    environment: string,
    datasetSlug: string,
    sloId: string,
  ): Promise<SLODetailedResponse> {
    return this.request<SLODetailedResponse>(
      environment,
      `/1/slos/${datasetSlug}/${sloId}`,
      { params: { detailed: true } },
    );
  }

  async getTriggers(
    environment: string,
    datasetSlug: string,
  ): Promise<TriggerResponse[]> {
    return this.request<TriggerResponse[]>(
      environment,
      `/1/triggers/${datasetSlug}`,
    );
  }

  async getTrigger(
    environment: string,
    datasetSlug: string,
    triggerId: string,
  ): Promise<TriggerResponse> {
    return this.request<TriggerResponse>(
      environment,
      `/1/triggers/${datasetSlug}/${triggerId}`,
    );
  }

  // Board methods
  async getBoards(environment: string): Promise<Board[]> {
    try {
      // Make the request to the boards endpoint
      const response = await this.request<any>(environment, "/1/boards");
      
      // Check if response is already an array (API might return array directly)
      if (Array.isArray(response)) {
        return response;
      }
      
      // Check if response has a boards property (expected structure)
      if (response && response.boards && Array.isArray(response.boards)) {
        return response.boards;
      }
      
      // If we get here, the response doesn't match either expected format
      return [];
    } catch (error) {
      // Return empty array instead of throwing to prevent breaking the application
      return [];
    }
  }

  async getBoard(environment: string, boardId: string): Promise<Board> {
    return this.request<Board>(environment, `/1/boards/${boardId}`);
  }

  // Marker methods
  async getMarkers(environment: string): Promise<Marker[]> {
    const response = await this.request<MarkersResponse>(environment, "/1/markers");
    return response.markers;
  }

  async getMarker(environment: string, markerId: string): Promise<Marker> {
    return this.request<Marker>(environment, `/1/markers/${markerId}`);
  }

  // Recipient methods
  async getRecipients(environment: string): Promise<Recipient[]> {
    const response = await this.request<RecipientsResponse>(environment, "/1/recipients");
    return response.recipients;
  }

  async getRecipient(environment: string, recipientId: string): Promise<Recipient> {
    return this.request<Recipient>(environment, `/1/recipients/${recipientId}`);
  }
}
