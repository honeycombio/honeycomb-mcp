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
import { Config, Environment } from "../config.js";
import { QueryError } from "../utils/errors.js";
import { getCache, ResourceType } from "../cache/index.js";

export class HoneycombAPI {
  private environments: Map<string, Environment>;
  private defaultApiEndpoint = "https://api.honeycomb.io";
  private userAgent = "@honeycombio/honeycomb-mcp/0.0.1";
  // Using the centralized cache system instead of a local Map

  constructor(config: Config) {
    this.environments = new Map(
      config.environments.map(env => [env.name, env])
    );
  }

  getEnvironments(): string[] {
    return Array.from(this.environments.keys());
  }
  
  /**
   * Check if an environment has a specific permission
   * 
   * @param environment - The environment name
   * @param permission - The permission to check
   * @returns True if the environment has the permission, false otherwise
   */
  hasPermission(environment: string, permission: string): boolean {
    const env = this.environments.get(environment);
    if (!env) {
      return false;
    }
    return env.permissions?.[permission] === true;
  }

  /**
   * Get authentication information for an environment
   * 
   * @param environment - The environment name
   * @returns Auth response with team and environment details
   */
  async getAuthInfo(environment: string): Promise<AuthResponse> {
    // Get cache instance
    const cache = getCache();
    
    // Check cache first
    const cachedAuthInfo = cache.get<AuthResponse>(environment, 'auth');
    if (cachedAuthInfo) {
      return cachedAuthInfo;
    }
    
    try {
      const authInfo = await this.requestWithRetry<AuthResponse>(environment, "/1/auth");
      
      // Cache the result
      cache.set<AuthResponse>(environment, 'auth', authInfo);
      
      // Update the environment with auth info if not already populated
      const env = this.environments.get(environment);
      if (env && (!env.teamSlug || !env.permissions)) {
        env.teamSlug = authInfo.team?.slug;
        env.teamName = authInfo.team?.name;
        env.environmentSlug = authInfo.environment?.slug;
        env.permissions = authInfo.api_key_access;
        this.environments.set(environment, env);
      }
      
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
    // First check if we already have the team slug in the environment
    const env = this.environments.get(environment);
    if (env?.teamSlug) {
      return env.teamSlug;
    }
    
    // Fall back to auth info
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
        "User-Agent": this.userAgent,
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
    const cache = getCache();
    
    // Check cache first
    const cachedDataset = cache.get<Dataset>(environment, 'dataset', datasetSlug);
    if (cachedDataset) {
      return cachedDataset;
    }
    
    // Fetch from API if not in cache
    const dataset = await this.requestWithRetry<Dataset>(
      environment, 
      `/1/datasets/${datasetSlug}`
    );
    
    // Cache the result
    cache.set<Dataset>(environment, 'dataset', dataset, datasetSlug);
    
    return dataset;
  }

  async listDatasets(environment: string): Promise<Dataset[]> {
    const cache = getCache();
    
    // Check cache first
    const cachedDatasets = cache.get<Dataset[]>(environment, 'dataset');
    if (cachedDatasets) {
      return cachedDatasets;
    }
    
    // Fetch from API if not in cache
    const datasets = await this.requestWithRetry<Dataset[]>(
      environment, 
      "/1/datasets"
    );
    
    // Cache the result
    cache.set<Dataset[]>(environment, 'dataset', datasets);
    
    return datasets;
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
    const cache = getCache();
    const cacheKey = `${datasetSlug}:all`;
    
    // Check cache first
    const cachedColumns = cache.get<Column[]>(environment, 'column', cacheKey);
    if (cachedColumns) {
      return cachedColumns;
    }
    
    // Fetch from API if not in cache
    const columns = await this.requestWithRetry<Column[]>(
      environment, 
      `/1/columns/${datasetSlug}`
    );
    
    // Cache the result
    cache.set<Column[]>(environment, 'column', columns, cacheKey);
    
    return columns;
  }

  async getColumnByName(
    environment: string,
    datasetSlug: string,
    keyName: string,
  ): Promise<Column> {
    const cache = getCache();
    const cacheKey = `${datasetSlug}:${keyName}`;
    
    // Check cache first
    const cachedColumn = cache.get<Column>(environment, 'column', cacheKey);
    if (cachedColumn) {
      return cachedColumn;
    }
    
    // Fetch from API if not in cache
    const column = await this.requestWithRetry<Column>(
      environment,
      `/1/columns/${datasetSlug}?key_name=${encodeURIComponent(keyName)}`,
    );
    
    // Cache the result
    cache.set<Column>(environment, 'column', column, cacheKey);
    
    return column;
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
    const cache = getCache();
    const cacheKey = datasetSlug;
    
    // Check cache first
    const cachedSLOs = cache.get<SLO[]>(environment, 'slo', cacheKey);
    if (cachedSLOs) {
      return cachedSLOs;
    }
    
    // Fetch from API if not in cache
    const slos = await this.requestWithRetry<SLO[]>(
      environment, 
      `/1/slos/${datasetSlug}`
    );
    
    // Cache the result
    cache.set<SLO[]>(environment, 'slo', slos, cacheKey);
    
    return slos;
  }

  async getSLO(
    environment: string,
    datasetSlug: string,
    sloId: string,
  ): Promise<SLODetailedResponse> {
    const cache = getCache();
    const cacheKey = `${datasetSlug}:${sloId}`;
    
    // Check cache first
    const cachedSLO = cache.get<SLODetailedResponse>(environment, 'slo', cacheKey);
    if (cachedSLO) {
      return cachedSLO;
    }
    
    // Fetch from API if not in cache
    const slo = await this.requestWithRetry<SLODetailedResponse>(
      environment,
      `/1/slos/${datasetSlug}/${sloId}`,
      { params: { detailed: true } },
    );
    
    // Cache the result
    cache.set<SLODetailedResponse>(environment, 'slo', slo, cacheKey);
    
    return slo;
  }

  async getTriggers(
    environment: string,
    datasetSlug: string,
  ): Promise<TriggerResponse[]> {
    const cache = getCache();
    const cacheKey = datasetSlug;
    
    // Check cache first
    const cachedTriggers = cache.get<TriggerResponse[]>(environment, 'trigger', cacheKey);
    if (cachedTriggers) {
      return cachedTriggers;
    }
    
    // Fetch from API if not in cache
    const triggers = await this.requestWithRetry<TriggerResponse[]>(
      environment,
      `/1/triggers/${datasetSlug}`,
    );
    
    // Cache the result
    cache.set<TriggerResponse[]>(environment, 'trigger', triggers, cacheKey);
    
    return triggers;
  }

  async getTrigger(
    environment: string,
    datasetSlug: string,
    triggerId: string,
  ): Promise<TriggerResponse> {
    const cache = getCache();
    const cacheKey = `${datasetSlug}:${triggerId}`;
    
    // Check cache first
    const cachedTrigger = cache.get<TriggerResponse>(environment, 'trigger', cacheKey);
    if (cachedTrigger) {
      return cachedTrigger;
    }
    
    // Fetch from API if not in cache
    const trigger = await this.requestWithRetry<TriggerResponse>(
      environment,
      `/1/triggers/${datasetSlug}/${triggerId}`,
    );
    
    // Cache the result
    cache.set<TriggerResponse>(environment, 'trigger', trigger, cacheKey);
    
    return trigger;
  }

  // Board methods
  async getBoards(environment: string): Promise<Board[]> {
    const cache = getCache();
    
    // Check cache first
    const cachedBoards = cache.get<Board[]>(environment, 'board');
    if (cachedBoards) {
      return cachedBoards;
    }
    
    try {
      // Make the request to the boards endpoint
      const response = await this.requestWithRetry<any>(environment, "/1/boards");
      
      // Process the response based on its format
      let boards: Board[] = [];
      
      // Check if response is already an array (API might return array directly)
      if (Array.isArray(response)) {
        boards = response;
      }
      // Check if response has a boards property (expected structure)
      else if (response && response.boards && Array.isArray(response.boards)) {
        boards = response.boards;
      }
      
      // Cache the result
      cache.set<Board[]>(environment, 'board', boards);
      
      return boards;
    } catch (error) {
      // Return empty array instead of throwing to prevent breaking the application
      return [];
    }
  }

  async getBoard(environment: string, boardId: string): Promise<Board> {
    const cache = getCache();
    
    // Check cache first
    const cachedBoard = cache.get<Board>(environment, 'board', boardId);
    if (cachedBoard) {
      return cachedBoard;
    }
    
    // Fetch from API if not in cache
    const board = await this.requestWithRetry<Board>(
      environment, 
      `/1/boards/${boardId}`
    );
    
    // Cache the result
    cache.set<Board>(environment, 'board', board, boardId);
    
    return board;
  }

  // Marker methods
  async getMarkers(environment: string): Promise<Marker[]> {
    const cache = getCache();
    
    // Check cache first
    const cachedMarkers = cache.get<Marker[]>(environment, 'marker');
    if (cachedMarkers) {
      return cachedMarkers;
    }
    
    // Fetch from API if not in cache
    const response = await this.requestWithRetry<MarkersResponse>(
      environment, 
      "/1/markers"
    );
    
    // Cache the result
    cache.set<Marker[]>(environment, 'marker', response.markers);
    
    return response.markers;
  }

  async getMarker(environment: string, markerId: string): Promise<Marker> {
    const cache = getCache();
    
    // Check cache first
    const cachedMarker = cache.get<Marker>(environment, 'marker', markerId);
    if (cachedMarker) {
      return cachedMarker;
    }
    
    // Fetch from API if not in cache
    const marker = await this.requestWithRetry<Marker>(
      environment, 
      `/1/markers/${markerId}`
    );
    
    // Cache the result
    cache.set<Marker>(environment, 'marker', marker, markerId);
    
    return marker;
  }

  // Recipient methods
  async getRecipients(environment: string): Promise<Recipient[]> {
    const cache = getCache();
    
    // Check cache first
    const cachedRecipients = cache.get<Recipient[]>(environment, 'recipient');
    if (cachedRecipients) {
      return cachedRecipients;
    }
    
    // Fetch from API if not in cache
    const response = await this.requestWithRetry<RecipientsResponse>(
      environment, 
      "/1/recipients"
    );
    
    // Cache the result
    cache.set<Recipient[]>(environment, 'recipient', response.recipients);
    
    return response.recipients;
  }

  async getRecipient(environment: string, recipientId: string): Promise<Recipient> {
    const cache = getCache();
    
    // Check cache first
    const cachedRecipient = cache.get<Recipient>(environment, 'recipient', recipientId);
    if (cachedRecipient) {
      return cachedRecipient;
    }
    
    // Fetch from API if not in cache
    const recipient = await this.requestWithRetry<Recipient>(
      environment, 
      `/1/recipients/${recipientId}`
    );
    
    // Cache the result
    cache.set<Recipient>(environment, 'recipient', recipient, recipientId);
    
    return recipient;
  }
}
