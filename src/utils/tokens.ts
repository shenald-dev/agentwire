/**
 * agentwire - Token Estimation & Waterfall Engine
 */

import { WireTokenMetrics } from '../types.js';

/**
 * Estimates token count for text using the standard heuristic
 * (approx. 4 characters per token for English text and code,
 * with adjustments for JSON syntax, whitespace, and special tokens).
 */
export function estimateTokens(content: unknown): number {
  if (content === null || content === undefined) return 0;

  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (typeof content === 'object') {
    try {
      text = JSON.stringify(content);
    } catch {
      text = String(content);
    }
  } else {
    text = String(content);
  }

  if (text.length === 0) return 0;

  // Code, punctuation, and structural characters tend to have a higher token-to-char ratio (~3.2 chars/token)
  // General English prose has ~4 chars/token
  const isCodeOrJson = /[{}\[\]:,"'<>=\+\-\*\/;()]/.test(text);
  const ratio = isCodeOrJson ? 3.3 : 3.8;

  const rawEstimate = Math.ceil(text.length / ratio);
  return Math.max(1, rawEstimate);
}

/**
 * Computes granular token distribution for an event payload
 */
export function computeEventMetrics(
  kind: string,
  payload: any,
  totalSessionTokens = 0
): WireTokenMetrics {
  const payloadTokens = estimateTokens(payload);

  let promptTokens = 0;
  let completionTokens = 0;
  let toolCallTokens = 0;
  let toolResultTokens = 0;

  switch (kind) {
    case 'prompt_turn':
      promptTokens = payloadTokens;
      break;
    case 'tool_call':
      toolCallTokens = payloadTokens;
      break;
    case 'tool_result':
      toolResultTokens = payloadTokens;
      break;
    default:
      completionTokens = payloadTokens;
      break;
  }

  const turnTokens = promptTokens + completionTokens + toolCallTokens + toolResultTokens;
  const newTotal = totalSessionTokens + turnTokens;
  const turnPercentage = newTotal > 0 ? Number(((turnTokens / newTotal) * 100).toFixed(1)) : 100;

  return {
    totalEstimatedTokens: turnTokens,
    promptTokens,
    completionTokens,
    toolCallTokens,
    toolResultTokens,
    turnPercentage
  };
}

/**
 * Formats a number of tokens into a human-readable badge (e.g., "1.4k tk")
 */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M tk`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k tk`;
  }
  return `${count} tk`;
}
