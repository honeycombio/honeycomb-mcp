# Caching Implementation Plan

This document outlines the caching implementation for the Honeycomb MCP server using `@stacksjs/ts-cache`.

## Overview

We've implemented caching for all non-query response data in the Honeycomb MCP server to reduce API calls, improve performance, and reduce rate limiting. The caching system:

1. Uses a TTL-based approach to ensure data freshness
2. Caches all resource types (datasets, columns, boards, SLOs, triggers, markers, recipients)
3. Normalizes cache keys with a consistent pattern: `environment:resource_type:resource_id`
4. Allows configuration through environment variables

## Implementation Details

### Cache Structure

1. **CacheManager Class**
   - Core class that manages multiple caches (one for each resource type)
   - Handles key generation, access, and cache maintenance
   - Implements the normalized keying pattern

2. **Cache Types**
   - Dataset lists and individual datasets
   - Column lists and individual columns
   - Board lists and individual boards
   - SLO lists and individual SLOs
   - Trigger lists and individual triggers
   - Marker lists and individual markers
   - Recipient lists and individual recipients
   - Authentication responses

3. **Configuration Options**
   - TTL per resource type
   - Global default TTL
   - Cache size limits
   - Ability to disable caching

### Implementation Steps Completed

1. **Core Caching Module**
   - Created `src/cache/index.ts` with the `CacheManager` class
   - Implemented TTL-based caching with the `@stacksjs/ts-cache` library
   - Added comprehensive tests in `src/cache/index.test.ts`

2. **Configuration**
   - Extended config system to support cache configuration
   - Added environment variable support for cache settings
   - Set sensible defaults for TTL values

3. **API Client Integration**
   - Refactored `HoneycombAPI` class to use caching
   - Integrated caching for all resource-fetching methods
   - Maintained backwards compatibility for tools and resources

4. **Cache Initialization**
   - Added cache initialization to the server startup process
   - Ensured tests initialize the cache appropriately

### API Endpoints with Caching

| Resource | Endpoint | Cache TTL | Cache Key |
|----------|----------|-----------|-----------|
| Auth | `/1/auth` | 3600s (1h) | `environment:auth` |
| Datasets (List) | `/1/datasets` | 900s (15m) | `environment:dataset` |
| Dataset (Get) | `/1/datasets/:slug` | 900s (15m) | `environment:dataset:slug` |
| Columns (List) | `/1/columns/:dataset` | 900s (15m) | `environment:column:dataset:all` |
| Column (Get) | `/1/columns/:dataset?key_name=` | 900s (15m) | `environment:column:dataset:column_name` |
| Boards (List) | `/1/boards` | 900s (15m) | `environment:board` |
| Board (Get) | `/1/boards/:id` | 900s (15m) | `environment:board:id` |
| SLOs (List) | `/1/slos/:dataset` | 900s (15m) | `environment:slo:dataset` |
| SLO (Get) | `/1/slos/:dataset/:id` | 900s (15m) | `environment:slo:dataset:id` |
| Triggers (List) | `/1/triggers/:dataset` | 900s (15m) | `environment:trigger:dataset` |
| Trigger (Get) | `/1/triggers/:dataset/:id` | 900s (15m) | `environment:trigger:dataset:id` |
| Markers (List) | `/1/markers` | 900s (15m) | `environment:marker` |
| Marker (Get) | `/1/markers/:id` | 900s (15m) | `environment:marker:id` |
| Recipients (List) | `/1/recipients` | 900s (15m) | `environment:recipient` |
| Recipient (Get) | `/1/recipients/:id` | 900s (15m) | `environment:recipient:id` |

### Configuration Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HONEYCOMB_CACHE_ENABLED` | Enable/disable caching | `true` |
| `HONEYCOMB_CACHE_DEFAULT_TTL` | Default TTL in seconds | `300` |
| `HONEYCOMB_CACHE_DATASET_TTL` | Dataset cache TTL | `900` |
| `HONEYCOMB_CACHE_COLUMN_TTL` | Column cache TTL | `900` |
| `HONEYCOMB_CACHE_BOARD_TTL` | Board cache TTL | `900` |
| `HONEYCOMB_CACHE_SLO_TTL` | SLO cache TTL | `900` |
| `HONEYCOMB_CACHE_TRIGGER_TTL` | Trigger cache TTL | `900` |
| `HONEYCOMB_CACHE_MARKER_TTL` | Marker cache TTL | `900` |
| `HONEYCOMB_CACHE_RECIPIENT_TTL` | Recipient cache TTL | `900` |
| `HONEYCOMB_CACHE_AUTH_TTL` | Auth cache TTL | `3600` |
| `HONEYCOMB_CACHE_MAX_SIZE` | Max items per cache | `1000` |

## Future Improvements

1. **Cache Invalidation**
   - Add explicit cache invalidation for specific resources
   - Implement cache refreshing for frequently accessed resources

2. **Metrics and Monitoring**
   - Add cache hit/miss metrics
   - Track cache eviction rates
   - Integrate with monitoring systems

3. **Advanced Features**
   - Implement stale-while-revalidate pattern
   - Add periodic background refresh
   - Optimize query result caching

4. **Persistence**
   - Add optional persistence for caches
   - Support for distributed caching across instances

## Testing Strategy

1. **Unit Tests**
   - Test CacheManager functionality
   - Test TTL and eviction behavior
   - Test configuration options

2. **Integration Tests**
   - Test API client with caching
   - Verify cached responses match direct responses
   - Test cache invalidation

3. **Performance Tests**
   - Measure API call reduction
   - Measure response time improvements
   - Test cache under load