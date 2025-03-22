# Testing Strategy for Honeycomb MCP

## Running Tests

- Run all tests: `pnpm test`
- Run tests with watch mode: `pnpm test:watch`
- Run a specific test: `pnpm test -- -t "test name"` (pattern matches test descriptions)
- Run tests in a specific file: `pnpm test -- src/path/to/file.test.ts`
- Run with coverage: `pnpm test:coverage`

## Current Test Coverage

The test suite currently covers:

1. **API Client Tests**
   - Basic API operations (datasets, columns, queries)
   - Error handling for API responses
   - Environment configuration

2. **Configuration Tests**
   - Config validation via Zod

3. **Helper Function Tests**
   - Statistical calculations
   - Data processing

4. **Query Validation Tests**
   - Time parameter combinations
   - Order and having clause validations

5. **Response Transformation Tests**
   - Data summarization
   - Result formatting

## Tests To Be Added

The following areas should be addressed in future test expansions:

### Priority 1 (Important)

1. **MCP Server Integration Tests**
   - Test the McpServer instance initialization
   - Test resource registration and tool invocation
   - Test MCP protocol message handling

2. **End-to-End Query Flow Tests**
   - Full API workflow from query creation to result processing

3. **Error Recovery Tests**
   - Test retry logic and graceful degradation

### Priority 2 (Next Phase)

1. **Authentication & Environment Tests**
   - Test API key management
   - Test environment switching and validation
   - Test configuration file search paths

2. **Edge Cases**
   - Large result sets
   - Special characters in column names
   - Query timeouts and cancellation
   - Partial response handling

3. **Advanced Query Features**
   - SLO queries
   - Trigger management
   - Complex filtering

### Priority 3 (Long Term)

1. **Performance Tests**
   - Response time testing
   - Memory usage monitoring
   - Context size optimization

2. **Versioning Tests**
   - Compatibility with Honeycomb API versions
   - Handling of deprecated features

3. **Integration with Different Client Tools**
   - LLM tool usage patterns
   - MCP integration with various clients

## Testing Principles

- Tests should be independent and not rely on external state
- Mock all external API calls
- Include both happy path and error case tests
- Test edge cases and unexpected inputs
- Ensure test coverage for critical paths (query validation, response handling)