import { describe, it, expect } from "vitest";
import { buildHelpText, HELP_TEXTS } from "../src/lib/help-texts.js";

describe("help-texts", () => {
  describe("HELP_TEXTS.sections", () => {
    it("should format source format section", () => {
      const result = HELP_TEXTS.sections.sourceFormat([
        "owner/repo@skill-name",
        "https://github.com/owner/repo",
      ]);

      expect(result).toContain("SOURCE FORMAT:");
      expect(result).toContain("owner/repo@skill-name");
      expect(result).toContain("https://github.com/owner/repo");
    });

    it("should format examples section", () => {
      const result = HELP_TEXTS.sections.examples([
        "wopal init",
        "wopal skills list",
      ]);

      expect(result).toContain("EXAMPLES:");
      expect(result).toContain("wopal init");
      expect(result).toContain("wopal skills list");
    });

    it("should format options section", () => {
      const result = HELP_TEXTS.sections.options([
        "--force    Force overwrite",
        "--json     JSON output",
      ]);

      expect(result).toContain("OPTIONS:");
      expect(result).toContain("--force");
      expect(result).toContain("--json");
    });

    it("should format notes section", () => {
      const result = HELP_TEXTS.sections.notes([
        "Skills are downloaded to INBOX",
        "Use scan before install",
      ]);

      expect(result).toContain("NOTES:");
      expect(result).toContain("- Skills are downloaded to INBOX");
      expect(result).toContain("- Use scan before install");
    });

    it("should format workflow section with numbered steps", () => {
      const result = HELP_TEXTS.sections.workflow([
        "Find skills",
        "Download",
        "Scan",
        "Install",
      ]);

      expect(result).toContain("WORKFLOW:");
      expect(result).toContain("1. Find skills");
      expect(result).toContain("2. Download");
      expect(result).toContain("3. Scan");
      expect(result).toContain("4. Install");
    });
  });

  describe("HELP_TEXTS.descriptions", () => {
    it("should have descriptions for all commands", () => {
      expect(HELP_TEXTS.descriptions.inbox).toBeDefined();
      expect(HELP_TEXTS.descriptions.inboxList).toBeDefined();
      expect(HELP_TEXTS.descriptions.list).toBeDefined();
      expect(HELP_TEXTS.descriptions.scan).toBeDefined();
      expect(HELP_TEXTS.descriptions.check).toBeDefined();
      expect(HELP_TEXTS.descriptions.download).toBeDefined();
      expect(HELP_TEXTS.descriptions.install).toBeDefined();
      expect(HELP_TEXTS.descriptions.init).toBeDefined();
    });
  });

  describe("HELP_TEXTS.errors", () => {
    it("should format missing argument error", () => {
      const result = HELP_TEXTS.errors.missingArgument("skill", "install");

      expect(result).toContain("Missing required argument: skill");
      expect(result).toContain("wopal install --help");
    });

    it("should format skill not found error", () => {
      const result = HELP_TEXTS.errors.skillNotFound("my-skill");

      expect(result).toContain("Skill 'my-skill' not found");
      expect(result).toContain("wopal list");
    });

    it("should format skill not in inbox error", () => {
      const result = HELP_TEXTS.errors.skillNotInInbox("pending");

      expect(result).toContain("Skill 'pending' not found in INBOX");
      expect(result).toContain("wopal inbox list");
    });

    it("should format skill already exists error", () => {
      const result = HELP_TEXTS.errors.skillAlreadyExists("existing");

      expect(result).toContain("Skill 'existing' is already installed");
      expect(result).toContain("--force");
    });

    it("should format invalid source error", () => {
      const result = HELP_TEXTS.errors.invalidSource("bad-format");

      expect(result).toContain("Invalid source format: bad-format");
      expect(result).toContain("owner/repo@skill-name");
    });
  });

  describe("HELP_TEXTS.statuses", () => {
    it("should have all status strings", () => {
      expect(HELP_TEXTS.statuses.downloaded).toBe("[Downloaded]");
      expect(HELP_TEXTS.statuses.installed).toBe("[Installed]");
      expect(HELP_TEXTS.statuses.critical).toBe("Critical");
      expect(HELP_TEXTS.statuses.warning).toBe("Warning");
      expect(HELP_TEXTS.statuses.passed).toBe("Passed");
    });
  });

  describe("HELP_TEXTS.messages", () => {
    it("should format skill removed message", () => {
      const result = HELP_TEXTS.messages.skillRemoved("test-skill");
      expect(result).toContain("test-skill");
      expect(result).toContain("removed from INBOX");
    });

    it("should format skill installed message", () => {
      const result = HELP_TEXTS.messages.skillInstalled("test-skill");
      expect(result).toContain("test-skill");
      expect(result).toContain("installed successfully");
    });

    it("should format skill downloaded message without overwrite", () => {
      const result = HELP_TEXTS.messages.skillDownloaded("test-skill");
      expect(result).toContain("test-skill");
      expect(result).toContain("Downloaded");
      expect(result).not.toContain("overwritten");
    });

    it("should format skill downloaded message with overwrite", () => {
      const result = HELP_TEXTS.messages.skillDownloaded("test-skill", true);
      expect(result).toContain("test-skill");
      expect(result).toContain("overwritten");
    });

    it("should have static messages", () => {
      expect(HELP_TEXTS.messages.noSkillsFound).toBe("No skills found");
      expect(HELP_TEXTS.messages.noUpdatesAvailable).toBe(
        "All skills are up to date",
      );
    });
  });

  describe("buildHelpText", () => {
    it("should build empty help text", () => {
      const result = buildHelpText();
      expect(result).toBe("");
    });

    it("should build help text with all sections", () => {
      const result = buildHelpText({
        sourceFormat: ["owner/repo@skill"],
        examples: ["wopal init"],
        options: ["--force"],
        notes: ["Note 1"],
        workflow: ["Step 1", "Step 2"],
      });

      expect(result).toContain("SOURCE FORMAT:");
      expect(result).toContain("EXAMPLES:");
      expect(result).toContain("OPTIONS:");
      expect(result).toContain("NOTES:");
      expect(result).toContain("WORKFLOW:");
    });

    it("should build help text with partial sections", () => {
      const result = buildHelpText({
        examples: ["wopal init"],
        options: ["--force"],
      });

      expect(result).toContain("EXAMPLES:");
      expect(result).toContain("OPTIONS:");
      expect(result).not.toContain("NOTES:");
      expect(result).not.toContain("WORKFLOW:");
    });
  });
});
