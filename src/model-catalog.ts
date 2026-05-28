import type { CommandCodeModelConfig } from "./types.js";

export interface CommandCodeModelDefinition {
  id: string;
  label: string;
  provider: string;
  family: string;
  aliases?: string[];
  enabledByDefault: boolean;
  notes?: string;
}

export const COMMANDCODE_MODEL_DEFINITIONS: CommandCodeModelDefinition[] = [
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    family: "deepseek",
    aliases: ["deepseek-v4-pro", "commandcode/deepseek-v4-pro"],
    enabledByDefault: true,
    notes: "$0.435/M in · $0.87/M out · cache hit $0.003625/M",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    family: "deepseek",
    aliases: ["deepseek-v4-flash", "commandcode/deepseek-v4-flash"],
    enabledByDefault: true,
    notes: "$0.14/M in · $0.28/M out · cache hit $0.01/M",
  },
  {
    id: "MiniMaxAI/MiniMax-M2.7",
    label: "MiniMax M2.7",
    provider: "MiniMax",
    family: "minimax",
    aliases: ["minimax-m2.7", "MiniMax-M2.7"],
    enabledByDefault: true,
    notes: "$0.30/M in · $1.20/M out · cache hit $0.06/M",
  },
  {
    id: "MiniMaxAI/MiniMax-M2.5",
    label: "MiniMax M2.5",
    provider: "MiniMax",
    family: "minimax",
    aliases: ["minimax-m2.5", "MiniMax-M2.5"],
    enabledByDefault: false,
    notes: "OSS pool model exposed by CommandCode 0.28.1",
  },
  {
    id: "Qwen/Qwen3.6-Max-Preview",
    label: "Qwen 3.6 Max Preview",
    provider: "Qwen",
    family: "qwen",
    aliases: ["qwen3.6-max-preview", "Qwen3.6-Max-Preview"],
    enabledByDefault: false,
    notes: "OSS pool model exposed by CommandCode 0.28.1",
  },
  {
    id: "Qwen/Qwen3.6-Plus",
    label: "Qwen 3.6 Plus",
    provider: "Qwen",
    family: "qwen",
    aliases: ["qwen3.6-plus", "Qwen3.6-Plus"],
    enabledByDefault: true,
    notes: "$0.50/M in · $3/M out · cache hit $0.10/M",
  },
  {
    id: "alibaba/qwen3.7-max",
    label: "Qwen 3.7 Max",
    provider: "Qwen",
    family: "qwen",
    aliases: ["qwen3.7-max", "Qwen3.7-Max"],
    enabledByDefault: false,
    notes: "OSS pool model exposed by CommandCode 0.28.1",
  },
  {
    id: "zai-org/GLM-5.1",
    label: "GLM 5.1",
    provider: "Z.ai",
    family: "glm",
    aliases: ["glm-5.1", "GLM-5.1"],
    enabledByDefault: true,
    notes: "$1.40/M in · $4.40/M out · cache hit $0.26/M",
  },
  {
    id: "zai-org/GLM-5",
    label: "GLM 5",
    provider: "Z.ai",
    family: "glm",
    aliases: ["glm-5", "GLM-5"],
    enabledByDefault: false,
    notes: "$0.95/M in · $3.15/M out",
  },
  {
    id: "moonshotai/Kimi-K2.6",
    label: "Kimi K2.6",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k2.6", "Kimi-K2.6"],
    enabledByDefault: true,
    notes: "$0.95/M in · $4/M out · cache hit $0.16/M",
  },
  {
    id: "moonshotai/Kimi-K2.5",
    label: "Kimi K2.5",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k2.5", "Kimi-K2.5"],
    enabledByDefault: false,
    notes: "$0.60/M in · $3/M out",
  },
  {
    id: "stepfun/Step-3.5-Flash",
    label: "Step 3.5 Flash",
    provider: "StepFun",
    family: "stepfun",
    aliases: ["step-3.5-flash", "Step-3.5-Flash"],
    enabledByDefault: false,
    notes: "OSS pool model exposed by CommandCode 0.28.1",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "Google",
    family: "gemini",
    aliases: ["gemini-3.5-flash", "Gemini-3.5-Flash"],
    enabledByDefault: false,
    notes: "Pro-level coding proficiency, parallel agentic execution",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "Google",
    family: "gemini",
    aliases: ["gemini-3.1-flash-lite", "Gemini-3.1-Flash-Lite"],
    enabledByDefault: false,
    notes: "High-volume workhorse model with implicit caching",
  },
  {
    id: "openai/gpt-5.5",
    label: "GPT 5.5",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["gpt-5.5", "GPT-5.5"],
    enabledByDefault: false,
    notes: "$5/M in · $30/M out",
  },
  {
    id: "openai/gpt-5.4",
    label: "GPT 5.4",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["gpt-5.4", "GPT-5.4"],
    enabledByDefault: false,
    notes: "$2.50/M in · $15/M out",
  },
  {
    id: "openai/gpt-5.3-codex",
    label: "GPT 5.3 Codex",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["gpt-5.3-codex", "GPT-5.3-Codex"],
    enabledByDefault: false,
    notes: "$2/M in · $8/M out",
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT 5.4 Mini",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["gpt-5.4-mini", "GPT-5.4-Mini"],
    enabledByDefault: false,
    notes: "$0.75/M in · $4.50/M out",
  },
  {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-opus-4.7", "opus-4.7"],
    enabledByDefault: false,
    notes: "$5/M in · $25/M out · cache hit $0.5/M",
  },
  {
    id: "anthropic/claude-opus-4.6",
    label: "Claude Opus 4.6",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-opus-4.6", "opus-4.6"],
    enabledByDefault: false,
    notes: "$5/M in · $25/M out · cache hit $0.5/M",
  },
  {
    id: "anthropic/claude-opus-4-5-20251101",
    label: "Claude Opus 4.5",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-opus-4.5", "opus-4.5"],
    enabledByDefault: false,
    notes: "$5/M in · $25/M out · cache hit $0.5/M",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-sonnet-4.6", "sonnet-4.6"],
    enabledByDefault: false,
    notes: "$3/M in · $15/M out · cache hit $0.3/M",
  },
  {
    id: "anthropic/claude-sonnet-4-5-20250929",
    label: "Claude Sonnet 4.5",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-sonnet-4.5", "sonnet-4.5"],
    enabledByDefault: false,
    notes: "$3/M in · $15/M out · cache hit $0.3/M",
  },
  {
    id: "anthropic/claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-sonnet-4", "sonnet-4"],
    enabledByDefault: false,
    notes: "$3/M in · $15/M out · cache hit $0.3/M",
  },
  {
    id: "anthropic/claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    family: "claude",
    aliases: ["claude-haiku-4.5", "haiku-4.5"],
    enabledByDefault: false,
    notes: "$1/M in · $5/M out · cache hit $0.1/M",
  },
];

export function modelAliasMap(): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const model of COMMANDCODE_MODEL_DEFINITIONS) {
    aliases[model.id] = model.id;
    for (const alias of model.aliases ?? []) aliases[alias] = model.id;
  }
  return aliases;
}

function fromDefinition(model: CommandCodeModelDefinition): CommandCodeModelConfig {
  const config: CommandCodeModelConfig = {
    id: model.id,
    label: model.label,
    provider: model.provider,
    family: model.family,
    enabled: model.enabledByDefault,
  };
  if (model.aliases) config.aliases = [...model.aliases];
  if (model.notes) config.notes = model.notes;
  return config;
}

export function defaultModelCatalog(): CommandCodeModelConfig[] {
  return COMMANDCODE_MODEL_DEFINITIONS.map(fromDefinition);
}

export function mergeModelCatalog(
  configuredModels: Array<Partial<CommandCodeModelConfig>> | undefined,
  envAllowedModels: string[] = [],
  normalize: (model: string) => string = (model) => model,
  enableMissingDefinitions = true,
): CommandCodeModelConfig[] {
  const definitions = new Map(defaultModelCatalog().map((model) => [model.id, model]));
  const configured = new Map<string, Partial<CommandCodeModelConfig>>();
  for (const entry of configuredModels ?? []) {
    if (typeof entry.id !== "string" || entry.id.trim().length === 0) continue;
    configured.set(normalize(entry.id.trim()), entry);
  }

  const catalog: CommandCodeModelConfig[] = [];
  for (const base of Array.from(definitions.values())) {
    const override = configured.get(base.id);
    const model: CommandCodeModelConfig = {
      id: base.id,
      enabled:
        override?.enabled ??
        (enableMissingDefinitions ? base.enabled : envAllowedModels.includes(base.id)),
    };
    const label = override?.label ?? base.label;
    const provider = override?.provider ?? base.provider;
    const family = override?.family ?? base.family;
    if (label) model.label = label;
    if (provider) model.provider = provider;
    if (family) model.family = family;
    const aliases = override?.aliases ?? base.aliases;
    const notes = override?.notes ?? base.notes;
    if (aliases) model.aliases = aliases;
    if (notes) model.notes = notes;
    catalog.push(model);
  }

  for (const [id, override] of Array.from(configured.entries())) {
    if (definitions.has(id)) continue;
    const model: CommandCodeModelConfig = {
      id,
      label: override.label ?? id,
      provider: override.provider ?? id.split("/")[0] ?? "custom",
      family: override.family ?? "custom",
      enabled: override.enabled ?? envAllowedModels.includes(id),
    };
    if (override.aliases) model.aliases = override.aliases;
    if (override.notes) model.notes = override.notes;
    catalog.push(model);
  }

  return catalog;
}
