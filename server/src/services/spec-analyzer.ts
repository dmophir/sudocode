/**
 * Spec Analyzer Service
 *
 * Analyzes spec quality and generates feedback:
 * - Checks for missing required sections
 * - Detects ambiguous language
 * - Validates structure and completeness
 * - Generates improvement suggestions
 */

export interface SpecAnalysisResult {
  specId: string;
  overallScore: number; // 0-100
  issues: SpecIssue[];
  suggestions: SpecSuggestion[];
  missingS: string[];
  strengths: string[];
}

export interface SpecIssue {
  type: "missing_section" | "ambiguous_language" | "incomplete" | "inconsistent";
  severity: "critical" | "warning" | "info";
  message: string;
  location?: {
    line?: number;
    section?: string;
  };
  suggestion?: string;
}

export interface SpecSuggestion {
  category: "structure" | "clarity" | "detail" | "acceptance_criteria";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  actionable: boolean;
}

/**
 * Required sections for a well-formed spec
 */
const REQUIRED_SECTIONS = [
  "## Overview",
  "## Requirements",
  "## Implementation",
  "## Testing",
  "## Success Criteria",
];

/**
 * Recommended optional sections
 */
const RECOMMENDED_SECTIONS = [
  "## Context",
  "## Design",
  "## Dependencies",
  "## Timeline",
  "## Risks",
  "## Alternatives",
];

/**
 * Ambiguous terms that should be clarified
 */
const AMBIGUOUS_TERMS = [
  /\b(should|could|may|might|possibly|probably)\b/gi,
  /\b(soon|later|eventually|sometime)\b/gi,
  /\b(some|few|many|several)\b/gi,
  /\b(fast|slow|big|small|simple)\b/gi,
  /\b(etc\.?|and so on)\b/gi,
];

/**
 * SpecAnalyzer Service
 */
export class SpecAnalyzer {
  /**
   * Analyze a spec and return quality assessment
   */
  analyzeSpec(specId: string, content: string, title: string): SpecAnalysisResult {
    const issues: SpecIssue[] = [];
    const suggestions: SpecSuggestion[] = [];
    const missingSections: string[] = [];
    const strengths: string[] = [];

    // Check for required sections
    const missedRequired = this.checkRequiredSections(content);
    if (missedRequired.length > 0) {
      missingSections.push(...missedRequired);
      issues.push({
        type: "missing_section",
        severity: "critical",
        message: `Missing required sections: ${missedRequired.join(", ")}`,
        suggestion: "Add these sections to provide complete context for implementation",
      });
    } else {
      strengths.push("Contains all required sections");
    }

    // Check for recommended sections
    const missedRecommended = this.checkRecommendedSections(content);
    if (missedRecommended.length > 0 && missedRecommended.length <= 3) {
      suggestions.push({
        category: "structure",
        title: "Consider adding recommended sections",
        description: `Adding ${missedRecommended.join(", ")} would improve clarity`,
        priority: "low",
        actionable: true,
      });
    }

    // Check for ambiguous language
    const ambiguousFindings = this.checkAmbiguousLanguage(content);
    if (ambiguousFindings.length > 0) {
      issues.push({
        type: "ambiguous_language",
        severity: "warning",
        message: `Found ${ambiguousFindings.length} instances of ambiguous language`,
        suggestion:
          "Replace vague terms with specific, measurable criteria (e.g., 'fast' → 'under 200ms')",
      });

      if (ambiguousFindings.length > 5) {
        suggestions.push({
          category: "clarity",
          title: "Reduce ambiguous language",
          description: `Found ${ambiguousFindings.length} vague terms. Replace with specific, measurable criteria.`,
          priority: "high",
          actionable: true,
        });
      }
    } else {
      strengths.push("Uses clear, specific language");
    }

    // Check spec length and detail
    const wordCount = content.split(/\s+/).length;
    if (wordCount < 100) {
      issues.push({
        type: "incomplete",
        severity: "critical",
        message: "Spec is very short and likely missing important details",
        suggestion: "Expand with implementation details, examples, and acceptance criteria",
      });
      suggestions.push({
        category: "detail",
        title: "Add more implementation details",
        description:
          "Spec is brief. Add examples, edge cases, and detailed requirements.",
        priority: "high",
        actionable: true,
      });
    } else if (wordCount > 200) {
      strengths.push("Contains detailed information");
    }

    // Check for acceptance criteria
    const hasAcceptanceCriteria = this.checkAcceptanceCriteria(content);
    if (!hasAcceptanceCriteria) {
      issues.push({
        type: "missing_section",
        severity: "warning",
        message: "No clear acceptance criteria found",
        location: { section: "Success Criteria" },
        suggestion: "Add bullet-point list of specific, testable acceptance criteria",
      });
      suggestions.push({
        category: "acceptance_criteria",
        title: "Add testable acceptance criteria",
        description:
          "Include bullet points describing exactly what 'done' looks like.",
        priority: "high",
        actionable: true,
      });
    } else {
      strengths.push("Has clear acceptance criteria");
    }

    // Check for code examples
    const hasCodeExamples = /```/.test(content);
    if (hasCodeExamples) {
      strengths.push("Includes code examples");
    } else if (content.length > 500) {
      suggestions.push({
        category: "clarity",
        title: "Add code examples",
        description: "Code examples would help illustrate the implementation approach",
        priority: "medium",
        actionable: true,
      });
    }

    // Check for links/references
    const hasLinks = /\[.+\]\(.+\)/.test(content) || /https?:\/\//.test(content);
    if (hasLinks) {
      strengths.push("Contains external references");
    }

    // Calculate overall score
    const overallScore = this.calculateScore(issues, strengths, wordCount);

    return {
      specId,
      overallScore,
      issues,
      suggestions,
      missingSections,
      strengths,
    };
  }

  /**
   * Check for required sections
   */
  private checkRequiredSections(content: string): string[] {
    const missing: string[] = [];

    for (const section of REQUIRED_SECTIONS) {
      // Check for section heading (case-insensitive, flexible whitespace)
      const sectionName = section.replace("## ", "");
      const regex = new RegExp(`^#{1,3}\\s*${sectionName}\\s*$`, "mi");
      if (!regex.test(content)) {
        missing.push(sectionName);
      }
    }

    return missing;
  }

  /**
   * Check for recommended sections
   */
  private checkRecommendedSections(content: string): string[] {
    const missing: string[] = [];

    for (const section of RECOMMENDED_SECTIONS) {
      const sectionName = section.replace("## ", "");
      const regex = new RegExp(`^#{1,3}\\s*${sectionName}\\s*$`, "mi");
      if (!regex.test(content)) {
        missing.push(sectionName);
      }
    }

    return missing;
  }

  /**
   * Check for ambiguous language
   */
  private checkAmbiguousLanguage(content: string): string[] {
    const findings: string[] = [];

    for (const pattern of AMBIGUOUS_TERMS) {
      const matches = content.match(pattern);
      if (matches) {
        findings.push(...matches);
      }
    }

    return findings;
  }

  /**
   * Check for acceptance criteria
   */
  private checkAcceptanceCriteria(content: string): boolean {
    // Look for bullet points or numbered lists in success criteria section
    const successCriteriaSection = content.match(
      /#{1,3}\s*(Success Criteria|Acceptance Criteria|Definition of Done)(.*?)(?=#{1,3}|$)/is
    );

    if (!successCriteriaSection) {
      return false;
    }

    const sectionContent = successCriteriaSection[2];

    // Check for bullet points or numbered lists
    const hasBullets = /^[\s]*[-*]\s+.+/m.test(sectionContent);
    const hasNumbers = /^[\s]*\d+\.\s+.+/m.test(sectionContent);

    return hasBullets || hasNumbers;
  }

  /**
   * Calculate overall quality score
   */
  private calculateScore(
    issues: SpecIssue[],
    strengths: string[],
    wordCount: number
  ): number {
    let score = 100;

    // Deduct for issues
    for (const issue of issues) {
      if (issue.severity === "critical") {
        score -= 20;
      } else if (issue.severity === "warning") {
        score -= 10;
      } else if (issue.severity === "info") {
        score -= 5;
      }
    }

    // Deduct if too short
    if (wordCount < 100) {
      score -= 30;
    } else if (wordCount < 200) {
      score -= 15;
    }

    // Add for strengths (up to +20)
    const strengthBonus = Math.min(strengths.length * 5, 20);
    score += strengthBonus;

    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate actionable feedback from analysis result
   */
  generateFeedback(analysis: SpecAnalysisResult): Array<{
    category: string;
    content: string;
    anchor?: string;
  }> {
    const feedback: Array<{ category: string; content: string; anchor?: string }> = [];

    // Add critical issues
    for (const issue of analysis.issues) {
      if (issue.severity === "critical") {
        feedback.push({
          category: "blocker",
          content: `**${issue.type}**: ${issue.message}\n\n${
            issue.suggestion ? `Suggestion: ${issue.suggestion}` : ""
          }`,
          anchor: issue.location?.section,
        });
      }
    }

    // Add high-priority suggestions
    for (const suggestion of analysis.suggestions) {
      if (suggestion.priority === "high") {
        feedback.push({
          category: "suggestion",
          content: `**${suggestion.title}**\n\n${suggestion.description}`,
          anchor: suggestion.category,
        });
      }
    }

    // Add warning issues
    for (const issue of analysis.issues) {
      if (issue.severity === "warning") {
        feedback.push({
          category: "question",
          content: `${issue.message}\n\n${
            issue.suggestion ? `Consider: ${issue.suggestion}` : ""
          }`,
          anchor: issue.location?.section,
        });
      }
    }

    // Add medium-priority suggestions
    for (const suggestion of analysis.suggestions) {
      if (suggestion.priority === "medium") {
        feedback.push({
          category: "suggestion",
          content: `**${suggestion.title}**\n\n${suggestion.description}`,
        });
      }
    }

    return feedback;
  }
}

/**
 * Create global spec analyzer instance
 */
export function createSpecAnalyzer(): SpecAnalyzer {
  return new SpecAnalyzer();
}
