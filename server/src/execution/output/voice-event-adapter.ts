/**
 * Voice Event Adapter
 *
 * Transforms AG-UI events into voice events for text-to-speech output.
 * Filters which messages should be spoken, splits long messages,
 * and determines message priority based on event type.
 *
 * @module execution/output/voice-event-adapter
 */

import type {
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallResultEvent,
  RunErrorEvent,
} from "@ag-ui/core";
import type {
  VoiceEvent,
  VoiceOutputData,
  VoiceStatusData,
} from "@sudocode-ai/types";

/**
 * Priority levels for TTS
 */
export type Priority = "high" | "normal" | "low";

/**
 * Configuration for voice event adapter
 */
export interface VoiceAdapterConfig {
  /**
   * Maximum length for a single TTS utterance (characters)
   * Messages longer than this will be split into chunks
   */
  maxUtteranceLength?: number;

  /**
   * Whether to speak tool call results
   */
  speakToolResults?: boolean;

  /**
   * Whether to speak error messages
   */
  speakErrors?: boolean;

  /**
   * Whether to speak status updates
   */
  speakStatus?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<VoiceAdapterConfig> = {
  maxUtteranceLength: 200,
  speakToolResults: false,
  speakErrors: true,
  speakStatus: false,
};

/**
 * VoiceEventAdapter - Transforms AG-UI events to voice events
 *
 * This adapter listens to AG-UI events and generates appropriate voice
 * output events for text-to-speech synthesis on the frontend.
 *
 * @example
 * ```typescript
 * const adapter = new VoiceEventAdapter('exec-123', {
 *   maxUtteranceLength: 200,
 *   speakErrors: true
 * });
 *
 * // Transform a text message event
 * const voiceEvents = adapter.processTextMessage({
 *   type: 'TEXT_MESSAGE_CONTENT',
 *   messageId: 'msg-1',
 *   content: 'Hello, I will help you with that task.'
 * });
 *
 * // voiceEvents contains VoiceEvent objects ready to broadcast
 * ```
 */
export class VoiceEventAdapter {
  private executionId: string;
  private config: Required<VoiceAdapterConfig>;
  private messageBuffers: Map<string, string> = new Map();
  private processingMessages: Set<string> = new Set();

  /**
   * Create a new voice event adapter
   *
   * @param executionId - Execution ID for this adapter
   * @param config - Optional configuration overrides
   */
  constructor(executionId: string, config?: VoiceAdapterConfig) {
    this.executionId = executionId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a text message start event
   *
   * @param event - TEXT_MESSAGE_START event
   * @returns Voice events to broadcast (if any)
   */
  processTextMessageStart(event: TextMessageStartEvent): VoiceEvent[] {
    // Initialize buffer for this message
    this.messageBuffers.set(event.messageId, "");
    this.processingMessages.add(event.messageId);
    return [];
  }

  /**
   * Process a text message content event
   *
   * @param event - TEXT_MESSAGE_CONTENT event
   * @returns Voice events to broadcast (if any)
   */
  processTextMessageContent(event: TextMessageContentEvent): VoiceEvent[] {
    // Buffer content - we'll speak it when the message ends
    const existing = this.messageBuffers.get(event.messageId) || "";
    this.messageBuffers.set(event.messageId, existing + event.delta);
    return [];
  }

  /**
   * Process a text message end event
   *
   * @param event - TEXT_MESSAGE_END event
   * @returns Voice events to broadcast
   */
  processTextMessageEnd(event: TextMessageEndEvent): VoiceEvent[] {
    const content = this.messageBuffers.get(event.messageId);
    this.messageBuffers.delete(event.messageId);
    this.processingMessages.delete(event.messageId);

    if (!content || content.trim().length === 0) {
      return [];
    }

    // Check if this is a user-facing message
    // Note: role may not be available on all events, so we default to speaking
    // We'll assume assistant messages should be spoken by default

    // Split into chunks if too long
    const chunks = this.splitMessage(content);
    const priority: Priority = "normal";

    return chunks.map((text, index) => ({
      type: "voice_output",
      executionId: this.executionId,
      timestamp: new Date().toISOString(),
      data: {
        text,
        priority,
        interrupt: false,
        chunkIndex: chunks.length > 1 ? index : undefined,
        totalChunks: chunks.length > 1 ? chunks.length : undefined,
      } as VoiceOutputData,
    }));
  }

  /**
   * Process a tool call result event
   *
   * @param event - TOOL_CALL_RESULT event
   * @returns Voice events to broadcast (if any)
   */
  processToolCallResult(_event: ToolCallResultEvent): VoiceEvent[] {
    if (!this.config.speakToolResults) {
      return [];
    }

    // Create a simple spoken message about the tool call
    // ToolCallResultEvent doesn't always have toolName, so we default
    const text = `Tool call completed`;

    return [
      {
        type: "voice_output",
        executionId: this.executionId,
        timestamp: new Date().toISOString(),
        data: {
          text,
          priority: "low",
          interrupt: false,
        } as VoiceOutputData,
      },
    ];
  }

  /**
   * Process a run error event
   *
   * @param event - RUN_ERROR event
   * @returns Voice events to broadcast
   */
  processRunError(event: RunErrorEvent): VoiceEvent[] {
    if (!this.config.speakErrors) {
      return [];
    }

    const text = `Error: ${event.message}`;

    return [
      {
        type: "voice_output",
        executionId: this.executionId,
        timestamp: new Date().toISOString(),
        data: {
          text,
          priority: "high",
          interrupt: true,
        } as VoiceOutputData,
      },
    ];
  }

  /**
   * Create a voice status event
   *
   * @param status - Status type
   * @param message - Optional message
   * @returns Voice status event
   */
  createStatusEvent(
    status: "listening" | "speaking" | "idle" | "error",
    message?: string
  ): VoiceEvent {
    return {
      type: "voice_status",
      executionId: this.executionId,
      timestamp: new Date().toISOString(),
      data: {
        status,
        message,
      } as VoiceStatusData,
    };
  }

  /**
   * Split a message into chunks for TTS
   *
   * Splits on sentence boundaries when possible to maintain natural speech flow.
   *
   * @param text - Text to split
   * @returns Array of text chunks
   */
  private splitMessage(text: string): string[] {
    const maxLength = this.config.maxUtteranceLength;

    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = "";

    for (const sentence of sentences) {
      // If a single sentence is too long, split it by words
      if (sentence.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }

        const words = sentence.split(" ");
        let wordChunk = "";

        for (const word of words) {
          if ((wordChunk + " " + word).length > maxLength) {
            if (wordChunk) {
              chunks.push(wordChunk.trim());
            }
            wordChunk = word;
          } else {
            wordChunk = wordChunk ? wordChunk + " " + word : word;
          }
        }

        if (wordChunk) {
          chunks.push(wordChunk.trim());
        }
      } else if ((currentChunk + " " + sentence).length > maxLength) {
        // Current chunk would be too long, save it and start new chunk
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        // Add sentence to current chunk
        currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Determine if an event should generate voice output
   *
   * @param event - AG-UI event to check
   * @returns Whether this event should be spoken
   */
  shouldSpeak(event: any): boolean {
    switch (event.type) {
      case "TEXT_MESSAGE_END":
        return event.role === "assistant";
      case "TOOL_CALL_RESULT":
        return this.config.speakToolResults;
      case "RUN_ERROR":
        return this.config.speakErrors;
      default:
        return false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.messageBuffers.clear();
    this.processingMessages.clear();
  }
}
