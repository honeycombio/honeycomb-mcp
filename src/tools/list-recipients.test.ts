import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createListRecipientsTool } from "./list-recipients.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the API client
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => ({
      getRecipients: vi.fn(),
    })),
  };
});

describe("list-recipients tool", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a list of recipients", async () => {
    const mockRecipients = [
      {
        id: "recipient-1",
        name: "Dev Team Email",
        type: "email" as const,
        target: "dev-team@example.com",
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-02T00:00:00Z",
      },
      {
        id: "recipient-2",
        name: "Slack Channel",
        type: "slack" as const,
        target: "#alerts",
        created_at: "2023-01-03T00:00:00Z",
        updated_at: "2023-01-04T00:00:00Z",
      },
    ];

    vi.mocked(api.getRecipients).mockResolvedValue(mockRecipients);

    const tool = createListRecipientsTool(api);
    const result = await tool.handler({ environment: "test-env" });

    expect(api.getRecipients).toHaveBeenCalledWith("test-env");
    
    // Type assertion to tell TypeScript this is a success result with metadata
    const successResult = result as { 
      content: { type: string; text: string }[]; 
      metadata: { count: number; environment: string } 
    };
    
    expect(successResult.content).toHaveLength(1);
    // Add a check that text property exists before attempting to parse it
    expect(successResult.content[0]?.text).toBeDefined();
    const content = JSON.parse(successResult.content[0]?.text || '[]');
    expect(content).toHaveLength(2);
    expect(content[0].id).toBe("recipient-1");
    expect(content[1].name).toBe("Slack Channel");
    expect(successResult.metadata.count).toBe(2);
  });

  it("handles API errors", async () => {
    const mockError = new Error("API error");
    vi.mocked(api.getRecipients).mockRejectedValue(mockError);
    
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tool = createListRecipientsTool(api);
    const result = await tool.handler({ environment: "test-env" });
    
    // Restore console.error
    consoleErrorSpy.mockRestore();

    // Type assertion to tell TypeScript this is an error result
    const errorResult = result as { 
      content: { type: string; text: string }[]; 
      error: { message: string } 
    };

    expect(errorResult.error).toBeDefined();
    expect(errorResult.error.message).toContain("API error");
  });

  it("requires the environment parameter", async () => {
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const tool = createListRecipientsTool(api);
    const result = await tool.handler({ environment: "" });
    
    // Restore console.error
    consoleErrorSpy.mockRestore();

    // Type assertion to tell TypeScript this is an error result
    const errorResult = result as { 
      content: { type: string; text: string }[]; 
      error: { message: string } 
    };

    expect(errorResult.error).toBeDefined();
    expect(errorResult.error.message).toContain("environment parameter is required");
  });

  it("has the correct name and schema", () => {
    const tool = createListRecipientsTool(api);
    expect(tool.name).toBe("list_recipients");
    expect(tool.schema).toBeDefined();
    expect(tool.schema.environment).toBeDefined();
  });
});