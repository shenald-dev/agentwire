/**
 * agentwire - Token Valuation, Cost Estimation & Context Health
 */

import { WireTokenMetrics } from '../types.js';

export interface ModelPricing {
  name: string;
  promptPerMillion: number;
  completionPerMillion: number;
  contextWindow: number;
}

export const KNOWN_MODELS: Record<string, ModelPricing> = {
  'claude-3.5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
    contextWindow: 200_000
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    promptPerMillion: 15.0,
    completionPerMillion: 75.0,
    contextWindow: 200_000
  },
  'gpt-4o': {
    name: 'GPT-4o',
    promptPerMillion: 2.5,
    completionPerMillion: 10.0,
    contextWindow: 128_000
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    promptPerMillion: 0.15,
    completionPerMillion: 0.6,
    contextWindow: 128_000
  },
  'gemini-1.5-pro': {
    name: 'Gemini 1.5 Pro',
    promptPerMillion: 3.5,
    completionPerMillion: 10.5,
    contextWindow: 1_000_000
  },
  default: {
    name: 'Standard LLM Benchmark',
    promptPerMillion: 3.0,
    completionPerMillion: 15.0,
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
}

/**
 * Calculates financial cost and context window exhaustion percentage
 */
export function calculateSessionCost(
  metrics: { promptTokens?: number; completionTokens?: number; totalEstimatedTokens: number },
  modelKey = 'default'
): CostEvaluation {
  const model = KNOWN_MODELS[modelKey.toLowerCase()] || KNOWN_MODELS.default;

  const promptCount = metrics.promptTokens || Math.round(metrics.totalEstimatedTokens * 0.7);
  const completionCount = metrics.completionTokens || (metrics.totalEstimatedTokens - promptCount);

  const promptCost = (promptCount / 1_000_000) * model.promptPerMillion;
  const completionCost = (completionCount / 1_000_000) * model.completionPerMillion;
  const totalCost = promptCost + completionCost;

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
    contextHealth
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
