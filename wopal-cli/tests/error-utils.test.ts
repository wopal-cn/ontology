import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  CommandError,
  handleCommandError,
  createMissingArgumentError,
  createSkillNotFoundError,
  createSkillNotInInboxError,
  createSkillAlreadyExistsError,
  createInvalidSourceError,
} from "../src/lib/error-utils.js";

describe("error-utils", () => {
  describe("CommandError", () => {
    it("should create error with code and message", () => {
      const error = new CommandError({
        code: "TEST_ERROR",
        message: "Test error message",
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CommandError);
      expect(error.name).toBe("CommandError");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test error message");
      expect(error.suggestion).toBeUndefined();
    });

    it("should create error with suggestion", () => {
      const error = new CommandError({
        code: "TEST_ERROR",
        message: "Test error message",
        suggestion: "Try this solution",
      });

      expect(error.suggestion).toBe("Try this solution");
    });

    it("should format user message without suggestion", () => {
      const error = new CommandError({
        code: "TEST_ERROR",
        message: "Something went wrong",
      });

      expect(error.toUserMessage()).toBe("Error: Something went wrong");
    });

    it("should format user message with suggestion", () => {
      const error = new CommandError({
        code: "TEST_ERROR",
        message: "Something went wrong",
        suggestion: "Try running init first",
      });

      expect(error.toUserMessage()).toBe(
        "Error: Something went wrong\n\nTry running init first",
      );
    });
  });

  describe("Error Factory Functions", () => {
    it("should create missing argument error", () => {
      const error = createMissingArgumentError("skill-name", "skills install");

      expect(error.code).toBe("MISSING_ARGUMENT");
      expect(error.message).toBe("Missing required argument: skill-name");
      expect(error.suggestion).toBe(
        "Use 'wopal skills install --help' for usage information",
      );
    });

    it("should create skill not found error", () => {
      const error = createSkillNotFoundError("my-skill");

      expect(error.code).toBe("SKILL_NOT_FOUND");
      expect(error.message).toBe("Skill 'my-skill' not found");
      expect(error.suggestion).toBe(
        "Use 'wopal list' to see installed skills",
      );
    });

    it("should create skill not in inbox error", () => {
      const error = createSkillNotInInboxError("pending-skill");

      expect(error.code).toBe("SKILL_NOT_IN_INBOX");
      expect(error.message).toBe("Skill 'pending-skill' not found in INBOX");
      expect(error.suggestion).toBe(
        "Use 'wopal inbox list' to see downloaded skills",
      );
    });

    it("should create skill already exists error", () => {
      const error = createSkillAlreadyExistsError("existing-skill");

      expect(error.code).toBe("SKILL_ALREADY_EXISTS");
      expect(error.message).toBe("Skill 'existing-skill' is already installed");
      expect(error.suggestion).toBe("Use --force to overwrite");
    });

    it("should create invalid source error", () => {
      const error = createInvalidSourceError("invalid-format");

      expect(error.code).toBe("INVALID_SOURCE");
      expect(error.message).toBe("Invalid source format: invalid-format");
      expect(error.suggestion).toBe("Use format: owner/repo@skill-name");
    });
  });

  describe("handleCommandError", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const mockConsoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    beforeEach(() => {
      mockExit.mockClear();
      mockConsoleError.mockClear();
    });

    afterAll(() => {
      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    });

    it("should handle CommandError with suggestion", () => {
      const error = new CommandError({
        code: "TEST",
        message: "Test error",
        suggestion: "Try this",
      });

      expect(() => handleCommandError(error)).toThrow("process.exit");
      expect(mockConsoleError).toHaveBeenCalledWith(
        "Error: Test error\n\nTry this",
      );
    });

    it("should handle standard Error", () => {
      const error = new Error("Standard error message");

      try {
        handleCommandError(error);
      } catch {
        // process.exit throws
      }

      expect(mockConsoleError).toHaveBeenCalledWith(
        "\nError: Standard error message",
      );
    });

    it("should handle non-Error values", () => {
      try {
        handleCommandError("string error");
      } catch {
        // process.exit throws
      }

      expect(mockConsoleError).toHaveBeenCalledWith("\nError: string error");
    });
  });
});
