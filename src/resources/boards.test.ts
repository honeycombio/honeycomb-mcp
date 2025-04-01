import { describe, it, expect, vi, beforeEach } from "vitest";
import { HoneycombAPI } from "../api/client.js";
import { createBoardsResource, handleBoardResource } from "./boards.js";
import { Board } from "../types/board.js";

// Mock board data
const mockBoards: Board[] = [
  {
    id: "board1",
    name: "API Dashboard",
    description: "Dashboard for API metrics",
    style: "standard",
    column_layout: "multi",
    queries: [
      {
        caption: "API Latency",
        dataset: "dataset1",
        query_id: "query1",
        query_style: "graph"
      }
    ],
    slos: ["slo1"],
    links: {
      board_url: "https://ui.honeycomb.io/team/board/board1"
    },
    created_at: "2023-01-01T00:00:00Z",
    updated_at: "2023-01-02T00:00:00Z"
  }
];

// Mock the API client
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => ({
      getEnvironments: vi.fn().mockReturnValue(["test-env"]),
      getBoards: vi.fn().mockResolvedValue(mockBoards),
      getBoard: vi.fn().mockResolvedValue(mockBoards[0]),
      getQuery: vi.fn().mockRejectedValue(new Error("API error")),
      getSLO: vi.fn().mockRejectedValue(new Error("API error"))
    })),
  };
});

describe("Boards Resource", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
    vi.clearAllMocks();
  });

  describe("createBoardsResource", () => {
    it("should create a resource template for boards", async () => {
      const template = createBoardsResource(api);
      expect(template).toBeDefined();
      // We can't properly test the list method in the test environment
      // Focus on testing the handler function instead
    });
  });

  describe("handleBoardResource", () => {
    it("should throw an error if environment is missing", async () => {
      await expect(handleBoardResource(api, {})).rejects.toThrow("Missing environment parameter");
    });

    it("should return a list of boards for an environment", async () => {
      const result = await handleBoardResource(api, { 
        environment: "test-env"
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents).not.toBeNull();
      expect(result.contents!.length).toBeGreaterThan(0);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/boards/board1");
      
      const board = JSON.parse(result.contents![0].text);
      expect(board).toMatchObject({
        id: "board1",
        name: "API Dashboard",
        description: "Dashboard for API metrics",
        queries: {
          count: 1
        },
        slo_count: 1,
        url: "https://ui.honeycomb.io/team/board/board1"
      });
    });

    it("should return detailed board information when a board ID is provided", async () => {
      const result = await handleBoardResource(api, { 
        environment: "test-env",
        boardId: "board1" 
      });
      
      expect(result.contents).toBeDefined();
      expect(result.contents).not.toBeNull();
      expect(result.contents!.length).toBeGreaterThan(0);
      expect(result.contents![0].uri).toBe("honeycomb://test-env/boards/board1");
      
      const board = JSON.parse(result.contents![0].text);
      expect(board).toMatchObject({
        id: "board1",
        name: "API Dashboard",
        description: "Dashboard for API metrics",
        queries: expect.arrayContaining([
          expect.objectContaining({
            caption: "API Latency",
            dataset: "dataset1",
            query_id: "query1"
          })
        ]),
        slos: expect.arrayContaining([
          expect.objectContaining({
            id: "slo1"
          })
        ]),
        url: "https://ui.honeycomb.io/team/board/board1"
      });
    });
  });
});