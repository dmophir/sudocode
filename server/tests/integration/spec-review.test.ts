/**
 * Integration tests for Spec Review functionality (Phase 5)
 *
 * Tests:
 * - Spec quality analysis
 * - Bulk feedback creation
 * - Diff generation for modify_spec actions
 * - End-to-end spec review workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { SpecAnalyzer } from "../../src/services/spec-analyzer.js";
import { ActionManager } from "../../src/services/project-agent-actions.js";
import { createEventBus, destroyEventBus } from "../../src/services/event-bus.js";
import {
  createProjectAgentExecution,
  getProjectAgentAction,
} from "../../src/services/project-agent-db.js";
import type { ProjectAgentConfig } from "@sudocode-ai/types";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { initDatabase } from "../../src/services/db.js";

describe("Spec Review Integration Tests", () => {
  let db: Database.Database;
  let tmpDir: string;
  let eventBus: any;
  let specAnalyzer: SpecAnalyzer;
  let actionManager: ActionManager;
  let projectAgentExecution: any;

  beforeEach(async () => {
    // Create temporary directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-review-test-"));
    const dbPath = path.join(tmpDir, "test.db");

    // Initialize database
    db = initDatabase({ path: dbPath });

    // Initialize EventBus
    eventBus = await createEventBus({
      db,
      baseDir: tmpDir,
      debounceDelay: 100,
    });

    // Create spec analyzer
    specAnalyzer = new SpecAnalyzer();

    // Create project agent execution
    const config: ProjectAgentConfig = {
      useWorktree: false,
      mode: "monitoring",
      autoApprove: { enabled: false, allowedActions: [] },
      monitoring: { watchExecutions: true, checkInterval: 60000, stalledExecutionThreshold: 3600000 },
    };

    projectAgentExecution = createProjectAgentExecution(db, {
      mode: "monitoring",
      config,
      worktreePath: null,
    });

    // Create action manager
    actionManager = new ActionManager(db, config, tmpDir);
  });

  afterEach(async () => {
    // Cleanup
    if (eventBus) {
      await destroyEventBus();
    }
    if (db) {
      db.close();
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("Spec Quality Analysis", () => {
    it("should analyze a complete spec with high score", () => {
      const goodSpec = `
# Test Spec

## Overview
This spec describes a user authentication system.

## Requirements
- Users must be able to login with email and password
- Sessions must persist for 30 days
- Failed logins must be locked after 5 attempts

## Implementation
Use JWT tokens for session management.

\`\`\`typescript
interface AuthToken {
  userId: string;
  expiresAt: Date;
}
\`\`\`

## Testing
- Unit tests for auth logic
- Integration tests for login flow
- E2E tests for session persistence

## Success Criteria
- Users can login successfully
- Sessions persist for exactly 30 days
- Account locks after 5 failed attempts
- JWT tokens are validated correctly
      `;

      const result = specAnalyzer.analyzeSpec("spec_test", goodSpec, "Test Spec");

      expect(result.overallScore).toBeGreaterThan(70);
      expect(result.missingSections).toHaveLength(0);
      expect(result.strengths.length).toBeGreaterThan(0);
    });

    it("should detect missing required sections", () => {
      const incompleteSpec = `
# Incomplete Spec

## Overview
This is an incomplete spec.
      `;

      const result = specAnalyzer.analyzeSpec("spec_incomplete", incompleteSpec, "Incomplete Spec");

      expect(result.overallScore).toBeLessThan(50);
      expect(result.missingSections.length).toBeGreaterThan(0);
      expect(result.missingSections).toContain("Requirements");
      expect(result.missingSections).toContain("Implementation");
      expect(result.missingSections).toContain("Testing");
      expect(result.missingSections).toContain("Success Criteria");
    });

    it("should detect ambiguous language", () => {
      const ambiguousSpec = `
# Ambiguous Spec

## Overview
The system should probably work fast and handle some requests.

## Requirements
- Users might want to login
- Performance could be important
- We should add features soon

## Implementation
Will figure this out later.

## Testing
Maybe add a few tests.

## Success Criteria
- System runs
      `;

      const result = specAnalyzer.analyzeSpec("spec_ambiguous", ambiguousSpec, "Ambiguous Spec");

      const ambiguousIssue = result.issues.find((i) => i.type === "ambiguous_language");
      expect(ambiguousIssue).toBeDefined();
      expect(result.overallScore).toBeLessThan(70);
    });

    it("should detect missing acceptance criteria", () => {
      const noCriteriaSpec = `
# No Criteria Spec

## Overview
A spec without acceptance criteria.

## Requirements
- Feature A
- Feature B

## Implementation
Build the features.

## Testing
Test the features.

## Success Criteria
The features work.
      `;

      const result = specAnalyzer.analyzeSpec("spec_no_criteria", noCriteriaSpec, "No Criteria");

      const criteriaIssue = result.issues.find((i) =>
        i.message.toLowerCase().includes("acceptance criteria")
      );
      expect(criteriaIssue).toBeDefined();
    });

    it("should recognize code examples as strength", () => {
      const specWithCode = `
# Spec with Code

## Overview
Example spec.

## Requirements
- API endpoints

## Implementation
\`\`\`typescript
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});
\`\`\`

## Testing
Test endpoints.

## Success Criteria
- Endpoints return 200
- Data is valid JSON
      `;

      const result = specAnalyzer.analyzeSpec("spec_with_code", specWithCode, "Code Example");

      expect(result.strengths).toContain("Includes code examples");
    });

    it("should generate actionable feedback", () => {
      const spec = `
# Test Spec

## Overview
Overview content.

## Requirements
Some requirements.
      `;

      const analysis = specAnalyzer.analyzeSpec("spec_test", spec, "Test");
      const feedback = specAnalyzer.generateFeedback(analysis);

      expect(feedback.length).toBeGreaterThan(0);
      expect(feedback[0]).toHaveProperty("category");
      expect(feedback[0]).toHaveProperty("content");
    });
  });

  describe("Diff Generation for modify_spec", () => {
    it("should generate diff when proposing modify_spec action", async () => {
      // Mock CLI client to return current spec
      (actionManager as any).cliClient = {
        exec: vi.fn().mockResolvedValue({
          id: "spec_123",
          title: "Original Title",
          content: "Original content",
          priority: 2,
        }),
      };

      const action = await actionManager.proposeAction({
        projectAgentExecutionId: projectAgentExecution.id,
        actionType: "modify_spec",
        payload: {
          spec_id: "spec_123",
          title: "Updated Title",
          description: "Updated content",
        },
        justification: "Improve spec clarity",
        priority: "high",
      });

      const payload = JSON.parse(action.payload_json);
      expect(payload._diff).toBeDefined();
      expect(payload._diff.changes).toBeDefined();
      expect(payload._diff.changes.length).toBeGreaterThan(0);

      // Check title change
      const titleChange = payload._diff.changes.find((c: any) => c.field === "title");
      expect(titleChange).toBeDefined();
      expect(titleChange.before).toBe("Original Title");
      expect(titleChange.after).toBe("Updated Title");

      // Check content change
      const contentChange = payload._diff.changes.find((c: any) => c.field === "content");
      expect(contentChange).toBeDefined();
      expect(contentChange.before).toBe("Original content");
      expect(contentChange.after).toBe("Updated content");
    });

    it("should handle diff generation errors gracefully", async () => {
      // Mock CLI client to throw error
      (actionManager as any).cliClient = {
        exec: vi.fn().mockRejectedValue(new Error("Spec not found")),
      };

      // Should not throw, just continue without diff
      const action = await actionManager.proposeAction({
        projectAgentExecutionId: projectAgentExecution.id,
        actionType: "modify_spec",
        payload: {
          spec_id: "nonexistent",
          title: "New Title",
        },
        justification: "Update spec",
      });

      expect(action).toBeDefined();
      const payload = JSON.parse(action.payload_json);
      // Diff should not be present due to error
      expect(payload._diff).toBeUndefined();
    });
  });

  describe("End-to-End Spec Review Workflow", () => {
    it("should complete full spec review workflow", async () => {
      // 1. Analyze spec quality
      const spec = `
# User Authentication

## Overview
Authentication system for users.

## Requirements
- Email/password login
- Session persistence
- Account lockout after failed attempts

## Implementation
Use JWT tokens.

## Testing
Unit and integration tests.

## Success Criteria
- Login works
- Sessions persist 30 days
- Lockout after 5 failures
      `;

      const analysis = specAnalyzer.analyzeSpec("spec_auth", spec, "User Authentication");
      expect(analysis.overallScore).toBeGreaterThan(0);

      // 2. Generate feedback from analysis
      const feedback = specAnalyzer.generateFeedback(analysis);
      expect(feedback).toBeDefined();

      // 3. Simulate adding bulk feedback
      // (would use CLI client in real scenario)
      const feedbackItems = feedback.map((f) => ({
        content: f.content,
        category: f.category,
        anchor: f.anchor,
      }));

      expect(feedbackItems.length).toBeGreaterThan(0);

      // 4. If score is low, propose modify_spec action
      if (analysis.overallScore < 60) {
        (actionManager as any).cliClient = {
          exec: vi.fn().mockResolvedValue({
            id: "spec_auth",
            title: "User Authentication",
            content: spec,
            priority: 2,
          }),
        };

        const action = await actionManager.proposeAction({
          projectAgentExecutionId: projectAgentExecution.id,
          actionType: "modify_spec",
          payload: {
            spec_id: "spec_auth",
            description: spec + "\n\n## Additional Context\nAdded more details.",
          },
          justification: `Spec quality score is ${analysis.overallScore}/100. Adding missing context.`,
          priority: "high",
        });

        expect(action).toBeDefined();
        expect(action.status).toBe("proposed");

        const payload = JSON.parse(action.payload_json);
        expect(payload._diff).toBeDefined();
      }
    });

    it("should propose create_issues action for high-quality spec", async () => {
      const highQualitySpec = `
# High Quality Spec

## Overview
Comprehensive spec with all required sections.

## Requirements
- Specific requirement 1 (under 200ms response time)
- Specific requirement 2 (99.9% uptime)
- Specific requirement 3 (handle 1000 requests/second)

## Implementation
Detailed implementation plan with code examples.

\`\`\`typescript
class Service {
  async process(): Promise<void> {
    // Implementation
  }
}
\`\`\`

## Testing
- Unit tests with 80%+ coverage
- Integration tests for all endpoints
- Load tests for performance validation
- E2E tests for user flows

## Success Criteria
- All requirements met
- Performance benchmarks passed
- Zero critical bugs
- Documentation complete
      `;

      const analysis = specAnalyzer.analyzeSpec("spec_hq", highQualitySpec, "High Quality");

      expect(analysis.overallScore).toBeGreaterThan(80);

      // For high-quality spec, propose creating issues
      (actionManager as any).cliClient = {
        exec: vi.fn().mockResolvedValue({ success: true, created: 3 }),
      };

      const action = await actionManager.proposeAction({
        projectAgentExecutionId: projectAgentExecution.id,
        actionType: "create_issues_from_spec",
        payload: {
          spec_id: "spec_hq",
          breakdown_strategy: "by_section",
        },
        justification: `Spec is well-formed (score: ${analysis.overallScore}/100) and ready to implement`,
        priority: "medium",
      });

      expect(action).toBeDefined();
      expect(action.action_type).toBe("create_issues_from_spec");
    });
  });

  describe("Spec Analyzer Edge Cases", () => {
    it("should handle very short spec", () => {
      const shortSpec = "# Short\n\nJust a title.";

      const result = specAnalyzer.analyzeSpec("spec_short", shortSpec, "Short");

      expect(result.overallScore).toBeLessThan(40);
      const incompleteIssue = result.issues.find((i) => i.type === "incomplete");
      expect(incompleteIssue).toBeDefined();
    });

    it("should handle spec with no sections", () => {
      const noSectionsSpec = "This is just plain text without any sections.";

      const result = specAnalyzer.analyzeSpec("spec_plain", noSectionsSpec, "Plain");

      expect(result.missingSections.length).toBeGreaterThan(3);
      expect(result.overallScore).toBeLessThan(30);
    });

    it("should calculate score correctly", () => {
      const perfectSpec = `
# Perfect Spec

## Overview
Clear overview with context and links to external resources.

## Requirements
- Requirement 1: Response time must be under 200ms
- Requirement 2: System must handle 1000 concurrent users
- Requirement 3: Data must be encrypted at rest and in transit

## Implementation
Detailed implementation with architecture diagrams and code examples.

\`\`\`typescript
interface Config {
  maxConcurrentUsers: number;
  responseTimeLimit: number;
}
\`\`\`

## Testing
- Unit tests with 90% coverage
- Integration tests for all critical paths
- Load tests simulating 1000+ users
- Security testing for encryption

## Success Criteria
- Response time consistently under 200ms
- Handles 1000 concurrent users without degradation
- All data encrypted (verified by audit)
- Zero high-severity security vulnerabilities
      `;

      const result = specAnalyzer.analyzeSpec("spec_perfect", perfectSpec, "Perfect");

      expect(result.overallScore).toBeGreaterThan(85);
      expect(result.missingSections).toHaveLength(0);
      expect(result.issues.length).toBe(0);
      expect(result.strengths.length).toBeGreaterThan(3);
    });
  });
});
