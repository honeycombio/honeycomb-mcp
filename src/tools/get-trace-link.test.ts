import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTraceDeepLinkTool } from "./get-trace-link.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the HoneycombAPI
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => {
      return {
        getAuthInfo: vi.fn(),
      };
    }),
  };
});

describe("get-trace-link tool", () => {
  let api: HoneycombAPI;
  let linkTool: ReturnType<typeof createTraceDeepLinkTool>;
  
  beforeEach(() => {
    api = new HoneycombAPI({ environments: [] });
    linkTool = createTraceDeepLinkTool(api);
    
    // Mock the auth info response
    (api.getAuthInfo as any).mockResolvedValue({
      team: {
        slug: "test-team",
      },
    });
  });
  
  it("should have the correct name and schema", () => {
    expect(linkTool.name).toBe("get_trace_link");
    expect(linkTool.schema).toBeDefined();
  });
  
  it("should generate a basic trace link", async () => {
    const result = await linkTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "trace123",
    });
    
    expect(api.getAuthInfo).toHaveBeenCalledWith("test-env");
    expect(result.content[0].text).toContain("trace123");
    
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.trace_url).toBe("https://ui.honeycomb.io/test-team/datasets/test-dataset/trace?trace_id=trace123");
  });
  
  it("should include optional parameters in the URL when provided", async () => {
    const result = await linkTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "trace123",
      spanId: "span456",
      traceStartTs: 1617123600,
      traceEndTs: 1617124800,
    });
    
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.trace_url).toContain("span_id=span456");
    expect(parsedResult.trace_url).toContain("trace_start_ts=1617123600");
    expect(parsedResult.trace_url).toContain("trace_end_ts=1617124800");
  });
  
  it("should properly URL encode trace and span IDs", async () => {
    const result = await linkTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "trace/123+456",
      spanId: "span/456+789",
    });
    
    const parsedResult = JSON.parse(result.content[0].text);
    expect(parsedResult.trace_url).toContain("trace_id=trace%2F123%2B456");
    expect(parsedResult.trace_url).toContain("span_id=span%2F456%2B789");
  });
  
  it("should handle errors when auth info cannot be retrieved", async () => {
    (api.getAuthInfo as any).mockRejectedValueOnce(new Error("Auth error"));
    
    const result = await linkTool.handler({
      environment: "test-env",
      dataset: "test-dataset",
      traceId: "trace123",
    }) as any;
    
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Auth error");
  });
});