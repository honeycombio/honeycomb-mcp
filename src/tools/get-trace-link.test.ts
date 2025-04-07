import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTraceDeepLinkTool } from "./get-trace-link.js";
import { handleToolError } from "../utils/tool-error.js";
import * as toolFactory from "../utils/tool-factory.js";

// Mock the handleToolError function
vi.mock("../utils/tool-error.js", () => ({
  handleToolError: vi.fn((error) => ({
    content: [{ type: "text", text: error.message }],
    isError: true
  }))
}));

// Mock the tool factory to pass through the handler
vi.mock("../utils/tool-factory.js", () => ({
  createTool: vi.fn((api, options) => ({
    name: options.name,
    description: options.description,
    schema: options.schema,
    handler: (params: any) => options.handler(params, api),
  }))
}));

describe("createTraceDeepLinkTool", () => {
  const mockApi = {
    getEnvironments: vi.fn(),
    listDatasets: vi.fn(),
    getVisibleColumns: vi.fn(),
    getColumnByName: vi.fn(),
    getTeamSlug: vi.fn().mockResolvedValue("test-team"), // Mock team slug retrieval
    getAuthInfo: vi.fn().mockResolvedValue({
      team: { slug: "test-team", name: "Test Team" }
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a basic trace link with required parameters", async () => {
    const tool = createTraceDeepLinkTool(mockApi as any);
    const result = await tool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "abc123",
    });

    if (result.content && result.content[0] && result.content[0].text) {
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      
      expect(text).toContain("https://ui.honeycomb.io/test-team/environments/test-env/datasets/test-dataset/trace?trace_id=abc123");
      expect(parsed).toHaveProperty("environment", "test-env");
      expect(parsed).toHaveProperty("dataset", "test-dataset");
      expect(parsed).toHaveProperty("traceId", "abc123");
      expect(parsed).toHaveProperty("team", "test-team");
      expect(mockApi.getTeamSlug).toHaveBeenCalledWith("test-env");
    } else {
      throw new Error("Expected result to have content[0].text");
    }
  });

  it("should include span ID when provided", async () => {
    const tool = createTraceDeepLinkTool(mockApi as any);
    const result = await tool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "abc123",
      spanId: "span456",
    });

    if (result.content && result.content[0] && result.content[0].text) {
      expect(result.content[0].text).toContain("&span=span456");
    } else {
      throw new Error("Expected result to have content[0].text");
    }
  });

  it("should include timestamps when provided", async () => {
    const tool = createTraceDeepLinkTool(mockApi as any);
    const result = await tool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "abc123",
      traceStartTs: 1614556800,
      traceEndTs: 1614560400,
    });

    if (result.content && result.content[0] && result.content[0].text) {
      expect(result.content[0].text).toContain("&trace_start_ts=1614556800");
      expect(result.content[0].text).toContain("&trace_end_ts=1614560400");
    } else {
      throw new Error("Expected result to have content[0].text");
    }
  });

  it("should properly URL-encode trace and span IDs", async () => {
    const tool = createTraceDeepLinkTool(mockApi as any);
    const result = await tool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "trace/with/slashes",
      spanId: "span with spaces",
    });

    if (result.content && result.content[0] && result.content[0].text) {
      expect(result.content[0].text).toContain("trace_id=trace%2Fwith%2Fslashes");
      expect(result.content[0].text).toContain("&span=span%20with%20spaces");
    } else {
      throw new Error("Expected result to have content[0].text");
    }
  });

  it("should handle error when required parameters are missing", async () => {
    // Mock the handleToolError to throw the original error in the test
    const createToolSpy = vi.spyOn(toolFactory, 'createTool');
    
    // Extract the handler function from the createTool call
    const tool = createTraceDeepLinkTool(mockApi as any);
    const options = createToolSpy.mock.calls[0][1];
    const handlerFn = options.handler;
    
    // Test with missing environment
    await expect(async () => {
      await handlerFn({
        dataset: "test-dataset",
        traceId: "abc123",
      }, mockApi);
    }).rejects.toThrow("Missing required parameter: environment");

    // Test with missing traceId
    await expect(async () => {
      await handlerFn({
        environment: "test-env",
        dataset: "test-dataset",
      }, mockApi);
    }).rejects.toThrow("Missing required parameter: traceId");
  });
});