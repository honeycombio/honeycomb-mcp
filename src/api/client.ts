import { z } from "zod";
import {
  QueryResult,
  AnalysisQuery,
  QueryCalculation,
} from "../types/query.js";
import { QueryToolSchema, ColumnAnalysisSchema } from "../types/schema.js";
import { HoneycombError } from "../utils/errors.js";
import { Column } from "../types/column.js";
import { Dataset, AuthResponse } from "../types/api.js";
import { SLO, SLODetailedResponse } from "../types/slo.js";
import { TriggerResponse } from "../types/trigger.js";
import { QueryOptions } from "../types/api.js";
import { Board, BoardsResponse } from "../types/board.js";
import { Marker, MarkersResponse } from "../types/marker.js";
import { Recipient, RecipientsResponse } from "../types/recipient.js";
import { Config } from "../config.js";
import { QueryError } from "../utils/errors.js";

export class HoneycombAPI {
  private environments: Map<string, { apiKey: string; apiEndpoint?: string }>;
  private defaultApiEndpoint = "https://api.honeycomb.io";
  // Cache for auth responses to avoid repeated API calls
  private authCache: Map<string, AuthResponse> = new Map();

  constructor(config: Config) {
    this.environments = new Map(
      config.environments.map(env => [env.name, { 
        apiKey: env.apiKey,
        apiEndpoint: env.apiEndpoint
      }])
    );
  }

  getEnvironments(): string[] {
    return Array.from(this.environments.keys());
  }
  
  /**
   * Get authentication information for an environment
   * 
   * @param environment - The environment name
   * @returns Auth response with team and environment details
   */
  async getAuthInfo(environment: string): Promise<AuthResponse> {
    // Check cache first
    if (this.authCache.has(environment)) {
      return this.authCache.get(environment)!;
    }
    
    try {
      const authInfo = await this.requestWithRetry<AuthResponse>(environment, "/1/auth");
      // Cache the result
      this.authCache.set(environment, authInfo);
      return authInfo;
    } catch (error) {
      throw new Error(`Failed to get auth info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get the team slug for an environment
   * 
   * @param environment - The environment name
   * @returns The team slug
   */
  async getTeamSlug(environment: string): Promise<string> {
    const authInfo = await this.getAuthInfo(environment);
    
    if (!authInfo.team?.slug) {
      throw new Error(`No team slug found for environment: ${environment}`);
    }
    
    return authInfo.team.slug;
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

  private getApiEndpoint(environment: string): string {
    const env = this.environments.get(environment);
    if (!env) {
      throw new Error(
        `Unknown environment: "${environment}". Available environments: ${Array.from(this.environments.keys()).join(", ")}`
      );
    }
    return env.apiEndpoint || this.defaultApiEndpoint;
  }

  /**
   * Makes a raw request to the Honeycomb API
   */
  private async request<T>(
    environment: string,
    path: string,
    options: RequestInit & { params?: Record<string, any> } = {},
  ): Promise<T> {
    const apiKey = this.getApiKey(environment);
    const apiEndpoint = this.getApiEndpoint(environment);
    const { params, ...requestOptions } = options;

    let url = `${apiEndpoint}${path}`;
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

    // Parse rate limit headers if present
    const rateLimit = response.headers.get('RateLimit');
    const rateLimitPolicy = response.headers.get('RateLimitPolicy');
    const retryAfter = response.headers.get('Retry-After');

    if (response.status === 429) {
      let errorMessage = "Rate limit exceeded";
      if (retryAfter) {
        errorMessage += `. Please try again after ${retryAfter}`;
      }
      if (rateLimit) {
        errorMessage += `. ${rateLimit}`;
      }
      throw new HoneycombError(429, errorMessage);
    }

    if (!response.ok) {
      // Try to get the error message from the response body
      let errorMessage = response.statusText;
      try {
        const errorBody = await response.json() as { error?: string } | string;
        if (typeof errorBody === 'object' && errorBody.error) {
          errorMessage = errorBody.error;
        } else if (typeof errorBody === 'string') {
          errorMessage = errorBody;
        }
      } catch (e) {
        // If we can't parse the error body, just use the status text
      }

      // Include rate limit info in error message if available
      if (rateLimit) {
        errorMessage += ` (Rate limit: ${rateLimit})`;
      }

      throw new HoneycombError(
        response.status,
        `Honeycomb API error: ${errorMessage}`,
      );
    }

    // Parse the response as JSON and validate it before returning
    const data = await response.json();
    return data as T;
  }

  /**
   * Makes a request to the Honeycomb API with automatic retries for rate limits
   */
  private async requestWithRetry<T>(
    environment: string,
    path: string,
    options: RequestInit & { 
      params?: Record<string, any>;
      maxRetries?: number;
    } = {},
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.request<T>(environment, path, options);
      } catch (error) {
        lastError = error as Error;
        
        // Only retry on rate limit errors
        if (error instanceof HoneycombError && error.statusCode === 429) {
          const retryDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.warn(`Rate limited, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // For other errors, throw immediately
        throw error;
      }
    }

    // If we get here, we've exhausted our retries
    throw lastError || new Error('Maximum retries exceeded');
  }

  // Dataset methods
  async getDataset(environment: string, datasetSlug: string): Promise<Dataset> {
    return this.requestWithRetry(environment, `/1/datasets/${datasetSlug}`);
  }

  async listDatasets(environment: string): Promise<Dataset[]> {
    return this.requestWithRetry(environment, "/1/datasets");
  }

  // Query methods
  async createQuery(
    environment: string,
    datasetSlug: string,
    query: AnalysisQuery,
  ): Promise<{ id: string }> {
    return this.requestWithRetry<{ id: string }>(
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
    return this.requestWithRetry<{ id: string }>(
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
    const response = await this.requestWithRetry<QueryResult>(
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
    return this.requestWithRetry(environment, `/1/columns/${datasetSlug}`);
  }

  async getColumnByName(
    environment: string,
    datasetSlug: string,
    keyName: string,
  ): Promise<Column> {
    return this.requestWithRetry(
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
    try {
      const defaultLimit = 100;
      
      // Remove both environment and dataset fields from query params
      const { environment: _, dataset: __, ...queryParams } = params;
      
      const queryWithLimit = {
        ...queryParams,
        limit: queryParams.limit || defaultLimit,
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
      if (error instanceof HoneycombError) {
        // For validation errors, enhance with context
        if (error.statusCode === 422) {
          throw HoneycombError.createValidationError(
            error.message,
            {
              environment,
              dataset: datasetSlug,
              granularity: params.granularity,
              api_route: `/1/queries/${datasetSlug}`
            }
          );
        }
        // For other HoneycombErrors, just rethrow them with route info
        error.message = `${error.message} (API route: /1/queries/${datasetSlug})`;
        throw error;
      }
      
      // For non-Honeycomb errors, wrap in a QueryError with route info
      throw new QueryError(
        `Analysis query failed: ${error instanceof Error ? error.message : "Unknown error"} (API route: /1/queries/${datasetSlug})`
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
    return this.requestWithRetry<SLO[]>(environment, `/1/slos/${datasetSlug}`);
  }

  async getSLO(
    environment: string,
    datasetSlug: string,
    sloId: string,
  ): Promise<SLODetailedResponse> {
    return this.requestWithRetry<SLODetailedResponse>(
      environment,
      `/1/slos/${datasetSlug}/${sloId}`,
      { params: { detailed: true } },
    );
  }

  async getTriggers(
    environment: string,
    datasetSlug: string,
  ): Promise<TriggerResponse[]> {
    return this.requestWithRetry<TriggerResponse[]>(
      environment,
      `/1/triggers/${datasetSlug}`,
    );
  }

  async getTrigger(
    environment: string,
    datasetSlug: string,
    triggerId: string,
  ): Promise<TriggerResponse> {
    return this.requestWithRetry<TriggerResponse>(
      environment,
      `/1/triggers/${datasetSlug}/${triggerId}`,
    );
  }

  // Board methods
  async getBoards(environment: string): Promise<Board[]> {
    try {
      // Make the request to the boards endpoint
      const response = await this.requestWithRetry<any>(environment, "/1/boards");
      
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
    return this.requestWithRetry<Board>(environment, `/1/boards/${boardId}`);
  }

  // Marker methods
  async getMarkers(environment: string): Promise<Marker[]> {
    const response = await this.requestWithRetry<MarkersResponse>(environment, "/1/markers");
    return response.markers;
  }

  async getMarker(environment: string, markerId: string): Promise<Marker> {
    return this.requestWithRetry<Marker>(environment, `/1/markers/${markerId}`);
  }

  // Recipient methods
  async getRecipients(environment: string): Promise<Recipient[]> {
    const response = await this.requestWithRetry<RecipientsResponse>(environment, "/1/recipients");
    return response.recipients;
  }

  async getRecipient(environment: string, recipientId: string): Promise<Recipient> {
    return this.requestWithRetry<Recipient>(environment, `/1/recipients/${recipientId}`);
  }
}
