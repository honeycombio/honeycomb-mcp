import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadConfig } from "./config.js";
import fs from "fs";
import path from "path";

vi.mock('fs');
vi.mock('path');

describe("Config", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("loadConfig", () => {
    it("loads valid config from file", () => {
      const config = {
        environments: [
          { name: "prod", apiKey: "prod-key" },
          { name: "dev", apiKey: "dev-key" },
        ],
      };
      
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));

      const loaded = loadConfig();
      expect(loaded).toEqual(config);
    });

    it("throws on missing config file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => loadConfig()).toThrow(/Configuration file not found/);
    });

    it("throws on invalid JSON", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json");
      expect(() => loadConfig()).toThrow();
    });

    it("throws on empty environments array", () => {
      const config = { environments: [] as Array<{name: string, apiKey: string, apiEndpoint?: string}> };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
      expect(() => loadConfig()).toThrow(/At least one environment/);
    });

    it("throws on missing required fields", () => {
      const config = {
        environments: [{ name: "prod" }], // missing apiKey
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config));
      expect(() => loadConfig()).toThrow();
    });
  });
}); 