import { z } from "zod";
import {
  QueryResult,
  AnalysisQuery,
  QueryCalculation,
} from "../types/query.js";
import { QueryToolSchema } from "../types/query-schemas.js";
import { ColumnAnalysisSchema } from "../types/query-schemas.js";
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
      let details: Record<string, any> = {};
      
      if (retryAfter) {
        errorMessage += `. Please try again after ${retryAfter}`;
        details.retryAfter = retryAfter;
      }
      if (rateLimit) {
        errorMessage += `. ${rateLimit}`;
        details.rateLimit = rateLimit;
      }
      if (rateLimitPolicy) {
        details.rateLimitPolicy = rateLimitPolicy;
      }
      
      // For rate limit errors, provide specific guidance on what to do
      const suggestions = [
        `Your request was rate limited. Please try again after ${retryAfter || 'the specified time'}.`,
        `Consider reducing the frequency of your requests.`
      ];
      
      throw new HoneycombError(429, errorMessage, suggestions, details);
    }

    if (!response.ok) {
      // Try to get the error message from the response body
      let errorMessage = response.statusText;
      let errorDetails: Record<string, any> = {
        statusCode: response.status,
        statusText: response.statusText,
        url: url
      };
      
      // Get content type to help determine parsing strategy
      const contentType = response.headers.get('Content-Type') || '';
      errorDetails.contentType = contentType;
      
      try {
        // Parse the response body based on content type
        if (contentType.includes('application/problem+json')) {
          // DetailedError format (RFC7807)
          const body = await response.json() as Record<string, any>;
          errorDetails.rawResponse = body;
          
          errorMessage = body.error || body.title || errorMessage;
          errorDetails = {
            ...errorDetails,
            type: body.type,
            title: body.title,
            detail: body.detail
          };
        } else if (contentType.includes('application/vnd.api+json')) {
          // JSONAPIError format
          const body = await response.json() as Record<string, any>;
          errorDetails.rawResponse = body;
          
          if (body.errors && Array.isArray(body.errors) && body.errors.length > 0) {
            const firstError = body.errors[0] as Record<string, any>;
            errorMessage = firstError.detail || firstError.title || 
                          (firstError.code ? `Error code: ${firstError.code}` : errorMessage);
            errorDetails = {
              ...errorDetails,
              errorId: firstError.id,
              code: firstError.code,
              title: firstError.title,
              detail: firstError.detail,
              allErrors: body.errors
            };
          }
        } else {
          // Simple Error format or other JSON (default)
          const body = await response.json() as Record<string, any> | string;
          errorDetails.rawResponse = body;
          
          if (typeof body === 'object' && body !== null) {
            if ('error' in body && body.error) {
              errorMessage = String(body.error);
            } else if ('message' in body && body.message) {
              errorMessage = String(body.message);
            }
            
            // Capture any validation errors
            if ('validation_errors' in body && body.validation_errors) {
              errorDetails.validationErrors = body.validation_errors;
            }
          } else if (typeof body === 'string') {
            errorMessage = body;
          }
        }
      } catch (e) {
        // If JSON parsing fails, try to get text content
        try {
          const textContent = await response.clone().text();
          if (textContent) {
            errorMessage = textContent.length > 200 
              ? textContent.substring(0, 200) + '...' 
              : textContent;
            errorDetails.textContent = textContent;
          }
        } catch (textError) {
          // If all else fails, stay with statusText
          errorDetails.parseError = e instanceof Error ? e.message : 'Unknown parsing error';
        }
      }

      // Include rate limit info
      if (rateLimit) {
        errorDetails.rateLimit = rateLimit;
      }
      if (rateLimitPolicy) {
        errorDetails.rateLimitPolicy = rateLimitPolicy;
      }
      if (retryAfter) {
        errorDetails.retryAfter = retryAfter;
      }

      // Build suggestions based on status code and other context
      const suggestions: string[] = [];
      
      if (response.status === 401) {
        suggestions.push(`Your API key for environment "${environment}" is invalid or expired.`);
        suggestions.push(`Check the API key configuration via HONEYCOMB_API_KEY or HONEYCOMB_ENV_*_API_KEY.`);
      } else if (response.status === 403) {
        suggestions.push(`Your API key for environment "${environment}" doesn't have permission to perform this operation.`);
        const availablePermissions = this.environments.get(environment)?.permissions;
        if (availablePermissions) {
          const permissionsList = Object.entries(availablePermissions)
            .filter(([_, value]) => value === true)
            .map(([key]) => key)
            .join(", ");
          suggestions.push(`Current permissions: ${permissionsList || "none"}`);
        }
      } else if (response.status === 404) {
        if (path.includes('/datasets/')) {
          const pathParts = path.split('/datasets/');
          if (pathParts.length > 1 && pathParts[1]) {
            const datasetPath = pathParts[1];
            const datasetSlug = datasetPath.split('/')[0] || 'unknown';
            suggestions.push(`The dataset "${datasetSlug}" was not found in environment "${environment}".`);
            suggestions.push(`Check that the dataset name is correct and that it exists in this environment.`);
          } else {
            suggestions.push(`The dataset was not found in environment "${environment}".`);
            suggestions.push(`Check that the dataset name is correct and that it exists in this environment.`);
          }
        } else {
          suggestions.push(`The requested resource was not found.`);
          suggestions.push(`Check that all IDs and resource names in your request are correct.`);
        }
      } else if (response.status === 422) {
        suggestions.push(`Your request contains invalid parameters.`);
        if (errorDetails.validationErrors) {
          suggestions.push(`Review the validation errors in the details section.`);
        }
      } else if (response.status >= 500) {
        suggestions.push(`There was a server-side issue with the Honeycomb API.`);
        suggestions.push(`This is likely a temporary issue. Please try again later.`);
      }
      
      throw new HoneycombError(
        response.status,
        `Honeycomb API error: ${errorMessage}`,
        suggestions,
        errorDetails
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
            },
            this
          );
        }
        // For other HoneycombErrors, just rethrow them with route info
        error.message = `${error.message} (API route: /1/queries/${datasetSlug})`;
        throw error;
      }
      
      // For non-Honeycomb errors, wrap in a QueryError with route info
      throw new QueryError(
        `Analysis query failed: ${error instanceof Error ? error.message : "Unknown error"} (API route: /1/queries/${datasetSlug})`,
        [],
        {
          errorType: error instanceof Error ? error.name : 'Unknown',
          originalMessage: error instanceof Error ? error.message : 'Unknown error',
          environment,
          dataset: datasetSlug,
          route: `/1/queries/${datasetSlug}`,
          parameters: params
        }
      );
    }
  }

  async analyzeColumns(
    environment: string,
    datasetSlug: string,
    params: z.infer<typeof ColumnAnalysisSchema>,
  ) {
    // Get column information for each requested column
    const columnPromises = params.columns.map(columnName => 
      this.getColumnByName(environment, datasetSlug, columnName)
    );
    
    const columns = await Promise.all(columnPromises);
    
    const query: AnalysisQuery = {
      calculations: [{ op: "COUNT" }],
      breakdowns: [...params.columns],
      time_range: params.timeRange || 3600,
      limit: 10,
    };
    
    // Only add orders if we have columns
    if (params.columns && params.columns.length > 0) {
      query.orders = [
        {
          column: params.columns[0] as string, // Force type assertion
          order: "descending",
        }
      ];
    }

    // Add numeric calculations for any numeric columns
    const numericColumns = columns.filter(
      col => col.type === "integer" || col.type === "float"
    );
    
    numericColumns.forEach(column => {
      const numericCalculations: QueryCalculation[] = [
        { op: "AVG", column: column.key_name },
        { op: "P95", column: column.key_name },
        { op: "MAX", column: column.key_name },
        { op: "MIN", column: column.key_name },
      ];
      
      if (!query.calculations) {
        query.calculations = [];
      }
      query.calculations.push(...numericCalculations);
    });

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
