/**
 * MCP tools for feedback management
 */

import { SudocodeClient } from "../client.js";
import { Feedback, FeedbackType } from "../types.js";

// Tool parameter types
export interface AddFeedbackParams {
  issue_id: string;
  spec_id: string;
  content: string;
  type?: FeedbackType;
  line?: number;
  text?: string;
  agent?: string;
}

// Bulk feedback parameters
export interface BulkFeedbackItem {
  content: string;
  type?: FeedbackType;
  category?: "question" | "suggestion" | "blocker";
  anchor?: string;
  line?: number;
  text?: string;
}

export interface AddBulkFeedbackParams {
  issue_id: string;
  spec_id: string;
  feedbackItems: BulkFeedbackItem[];
  agent?: string;
}

/**
 * Add anchored feedback to a spec
 */
export async function addFeedback(
  client: SudocodeClient,
  params: AddFeedbackParams
): Promise<Feedback> {
  const args = ["feedback", "add", params.issue_id, params.spec_id];

  args.push("--content", params.content);

  if (params.type) {
    args.push("--type", params.type);
  }
  if (params.line !== undefined) {
    args.push("--line", params.line.toString());
  }
  if (params.text) {
    args.push("--text", params.text);
  }
  // if (params.agent) {
  //   args.push("--agent", params.agent);
  // }

  return client.exec(args);
}

/**
 * Add multiple feedback items to a spec
 *
 * Useful for project agent to add comprehensive feedback at once
 */
export async function addBulkFeedback(
  client: SudocodeClient,
  params: AddBulkFeedbackParams
): Promise<{ feedbackCreated: number; feedback: Feedback[] }> {
  const createdFeedback: Feedback[] = [];

  for (const item of params.feedbackItems) {
    try {
      const feedback = await addFeedback(client, {
        issue_id: params.issue_id,
        spec_id: params.spec_id,
        content: item.content,
        type: item.type,
        line: item.line,
        text: item.text,
        agent: params.agent,
      });
      createdFeedback.push(feedback);
    } catch (error) {
      console.error("[addBulkFeedback] Error adding feedback item:", error);
      // Continue with other items
    }
  }

  return {
    feedbackCreated: createdFeedback.length,
    feedback: createdFeedback,
  };
}
