/**
 * agentwire - Token Valuation, Cost Estimation & Context Health
 * Comprehensive pricing calculation across Anthropic, OpenAI, Google Gemini, DeepSeek, and Meta models
 * with prompt caching and reasoning token support.
 */

import { WireTokenMetrics } from '../types.js';

export interface ModelPricing {
  name: string;
  promptPerMillion: number;
  completionPerMillion: number;
  contextWindow: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export const KNOWN_MODELS: Record<string, ModelPricing> = {
  'claude-3.7-sonnet': {
    name: 'Claude 3.7 Sonnet',
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    cacheReadPerMillion: 0.30,
    contextWindow: 200_000
  },
  'claude-3.5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    cacheReadPerMillion: 0.30,
    contextWindow: 200_000
  },
  'claude-3.5-haiku': {
    name: 'Claude 3.5 Haiku',
    promptPerMillion: 0.80,
    completionPerMillion: 4.0,
    cacheReadPerMillion: 0.08,
    contextWindow: 200_000
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    promptPerMillion: 15.0,
    completionPerMillion: 75.0,
    cacheReadPerMillion: 1.50,
    contextWindow: 200_000
  },
  'gpt-4o': {
    name: 'GPT-4o',
    promptPerMillion: 2.5,
    completionPerMillion: 10.0,
    cacheReadPerMillion: 1.25,
    contextWindow: 128_000
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    promptPerMillion: 0.15,
    completionPerMillion: 0.6,
    cacheReadPerMillion: 0.075,
    contextWindow: 128_000
  },
  'gpt-4.5-preview': {
    name: 'GPT-4.5 Preview',
    promptPerMillion: 75.0,
    completionPerMillion: 150.0,
    cacheReadPerMillion: 37.5,
    contextWindow: 128_000
  },
  o1: {
    name: 'OpenAI o1',
    promptPerMillion: 15.0,
    completionPerMillion: 60.0,
    cacheReadPerMillion: 7.5,
    contextWindow: 200_000
  },
  'o1-mini': {
    name: 'OpenAI o1-mini',
    promptPerMillion: 1.10,
    completionPerMillion: 4.40,
    cacheReadPerMillion: 0.55,
    contextWindow: 128_000
  },
  'o3-mini': {
    name: 'OpenAI o3-mini',
    promptPerMillion: 1.10,
    completionPerMillion: 4.40,
    cacheReadPerMillion: 0.55,
    contextWindow: 200_000
  },
  'gemini-2.0-flash': {
    name: 'Gemini 2.0 Flash',
    promptPerMillion: 0.10,
    completionPerMillion: 0.40,
    contextWindow: 1_000_000
  },
  'gemini-2.0-pro': {
    name: 'Gemini 2.0 Pro',
    promptPerMillion: 1.25,
    completionPerMillion: 5.0,
    contextWindow: 2_000_000
  },
  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    promptPerMillion: 3.5,
    completionPerMillion: 10.5,
    contextWindow: 1_000_000
  },
  'gemini-1.5-flash': {
    name: 'Gemini 1.5 Flash',
    promptPerMillion: 0.075,
    completionPerMillion: 0.30,
    contextWindow: 1_000_000
  },
  'deepseek-chat': {
    name: 'DeepSeek-V3',
    promptPerMillion: 0.27,
    completionPerMillion: 1.10,
    cacheReadPerMillion: 0.07,
    contextWindow: 64_000
  },
  'deepseek-reasoner': {
    name: 'DeepSeek-R1',
    promptPerMillion: 0.55,
    completionPerMillion: 2.19,
    cacheReadPerMillion: 0.14,
    contextWindow: 64_000
  },
  'llama-3.3-70b': {
    name: 'Llama 3.3 70B',
    promptPerMillion: 0.59,
    completionPerMillion: 0.79,
    contextWindow: 128_000
  },
  default: {
    name: 'Standard LLM Benchmark',
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    cacheReadPerMillion: 0.75,
    contextWindow: 128_000
  }
};

export interface CostEvaluation {
  modelName: string;
  estimatedCostUsd: number;
  formattedCost: string;
  contextWindow: number;
  contextUsedPct: number;
  remainingTokens: number;
  contextHealth: 'healthy' | 'warning' | 'critical';
  cacheSavingsUsd?: number;
}

/**
 * Calculates financial cost and context window exhaustion percentage
 */
export function calculateSessionCost(
  metrics: {
    promptTokens?: number;
    completionTokens?: number;
    totalEstimatedTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
  },
  modelKey = 'default'
): CostEvaluation {
  const model = KNOWN_MODELS[modelKey.toLowerCase()] || KNOWN_MODELS.default;

  const cacheReadCount = metrics.cacheReadTokens || 0;
  const regularPromptCount = metrics.promptTokens !== undefined
    ? Math.max(0, metrics.promptTokens - cacheReadCount)
    : Math.round(metrics.totalEstimatedTokens * 0.7);

  const completionCount = metrics.completionTokens !== undefined
    ? metrics.completionTokens
    : (metrics.totalEstimatedTokens - regularPromptCount - cacheReadCount);

  // Standard prompt cost
  const promptCost = (regularPromptCount / 1_000_000) * model.promptPerMillion;

  // Cache read discount cost
  const cacheRate = model.cacheReadPerMillion !== undefined
    ? model.cacheReadPerMillion
    : model.promptPerMillion * 0.2;
  const cacheCost = (cacheReadCount / 1_000_000) * cacheRate;

  // Completion cost (including reasoning tokens)
  const completionCost = (Math.max(0, completionCount) / 1_000_000) * model.completionPerMillion;

  const totalCost = promptCost + cacheCost + completionCost;

  // Calculate savings from prompt cache
  const fullPricePromptCost = (cacheReadCount / 1_000_000) * model.promptPerMillion;
  const cacheSavings = Math.max(0, fullPricePromptCost - cacheCost);

  const contextUsedPct = Math.min(100, (metrics.totalEstimatedTokens / model.contextWindow) * 100);
  const remainingTokens = Math.max(0, model.contextWindow - metrics.totalEstimatedTokens);

  let contextHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (contextUsedPct >= 90) {
    contextHealth = 'critical';
  } else if (contextUsedPct >= 70) {
    contextHealth = 'warning';
  }

  return {
    modelName: model.name,
    estimatedCostUsd: Number(totalCost.toFixed(5)),
    formattedCost: formatUsd(totalCost),
    contextWindow: model.contextWindow,
    contextUsedPct: Number(contextUsedPct.toFixed(1)),
    remainingTokens,
    contextHealth,
    cacheSavingsUsd: cacheSavings > 0 ? Number(cacheSavings.toFixed(5)) : undefined
  };
}

/**
 * Formats a raw USD number into human-readable currency
 */
export function formatUsd(amount: number): string {
  if (amount < 0.001) {
    return `$${amount.toFixed(4)}`;
  }
  if (amount < 0.01) {
    return `$${amount.toFixed(3)}`;
  }
  return `$${amount.toFixed(2)}`;
}
