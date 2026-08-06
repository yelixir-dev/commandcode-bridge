import type { CommandCodeModelConfig } from "./types.js";

export interface CommandCodeModelDefinition {
  id: string;
  label: string;
  provider: string;
  family: string;
  aliases?: string[];
  contextWindow?: number;
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
    contextWindow: 1_000_000,
    enabledByDefault: true,
    notes: "$0.435/M in · $0.87/M out",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    family: "deepseek",
    aliases: ["deepseek-v4-flash", "commandcode/deepseek-v4-flash"],
    contextWindow: 1_000_000,
    enabledByDefault: true,
    notes: "$0.14/M in · $0.28/M out",
  },
  {
    id: "moonshotai/Kimi-K3",
    label: "Kimi K3",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k3", "Kimi-K3"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$3/M in · $15/M out",
  },
  {
    id: "moonshotai/Kimi-K2.7-Code",
    label: "Kimi K2.7 Code",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k2.7-code", "Kimi-K2.7-Code"],
    contextWindow: 256_000,
    enabledByDefault: false,
    notes: "$0.95/M in · $4/M out",
  },
  {
    id: "moonshotai/Kimi-K2.7-Code-Highspeed",
    label: "Kimi K2.7 Code HighSpeed",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k2.7-code-highspeed", "Kimi-K2.7-Code-Highspeed", "Kimi-K2.7-Code-HighSpeed"],
    contextWindow: 262_000,
    enabledByDefault: false,
    notes: "$1.9/M in · $8/M out",
  },
  {
    id: "moonshotai/Kimi-K2.6",
    label: "Kimi K2.6",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k2.6", "Kimi-K2.6"],
    contextWindow: 256_000,
    enabledByDefault: true,
    notes: "$0.95/M in · $4/M out",
  },
  {
    id: "moonshotai/Kimi-K2.5",
    label: "Kimi K2.5",
    provider: "Moonshot",
    family: "kimi",
    aliases: ["kimi-k2.5", "Kimi-K2.5"],
    contextWindow: 256_000,
    enabledByDefault: false,
    notes: "$0.6/M in · $3/M out",
  },
  {
    id: "zai-org/GLM-5.2",
    label: "GLM 5.2",
    provider: "Z.ai",
    family: "glm",
    aliases: ["glm-5.2", "GLM-5.2", "zai/glm-5.2"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$1.4/M in · $4.4/M out",
  },
  {
    id: "zai-org/GLM-5.2-Fast",
    label: "GLM 5.2 Fast",
    provider: "Z.ai",
    family: "glm",
    aliases: ["glm-5.2-fast", "GLM-5.2-Fast", "zai/glm-5.2-fast"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$3/M in · $10.25/M out",
  },
  {
    id: "zai-org/GLM-5.1",
    label: "GLM 5.1",
    provider: "Z.ai",
    family: "glm",
    aliases: ["glm-5.1", "GLM-5.1"],
    enabledByDefault: true,
    notes: "$1.4/M in · $4.4/M out",
  },
  {
    id: "zai-org/GLM-5",
    label: "GLM 5",
    provider: "Z.ai",
    family: "glm",
    aliases: ["glm-5", "GLM-5"],
    contextWindow: 200_000,
    enabledByDefault: false,
    notes: "$1/M in · $3.2/M out",
  },
  {
    id: "MiniMaxAI/MiniMax-M3",
    label: "MiniMax M3",
    provider: "MiniMax",
    family: "minimax",
    aliases: ["minimax-m3", "MiniMax-M3"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.3/M in · $1.2/M out",
  },
  {
    id: "MiniMaxAI/MiniMax-M2.7",
    label: "MiniMax M2.7",
    provider: "MiniMax",
    family: "minimax",
    aliases: ["minimax-m2.7", "MiniMax-M2.7"],
    enabledByDefault: true,
    notes: "$0.3/M in · $1.2/M out",
  },
  {
    id: "MiniMaxAI/MiniMax-M2.5",
    label: "MiniMax M2.5",
    provider: "MiniMax",
    family: "minimax",
    aliases: ["minimax-m2.5", "MiniMax-M2.5"],
    contextWindow: 200_000,
    enabledByDefault: false,
    notes: "$0.3/M in · $1.2/M out",
  },
  {
    id: "xiaomi/mimo-v2.5-pro",
    label: "MiMo V2.5 Pro",
    provider: "Xiaomi",
    family: "mimo",
    aliases: ["mimo-v2.5-pro", "MiMo-V2.5-Pro"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.435/M in · $0.87/M out",
  },
  {
    id: "xiaomi/mimo-v2.5",
    label: "MiMo V2.5",
    provider: "Xiaomi",
    family: "mimo",
    aliases: ["mimo-v2.5", "MiMo-V2.5"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.14/M in · $0.28/M out",
  },
  {
    id: "Qwen/Qwen3.8-Max",
    label: "Qwen 3.8 Max",
    provider: "Qwen",
    family: "qwen",
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$2/M in · $6/M out",
  },
  {
    id: "Qwen/Qwen3.7-Max",
    label: "Qwen 3.7 Max",
    provider: "Qwen",
    family: "qwen",
    aliases: ["alibaba/qwen3.7-max", "qwen3.7-max", "Qwen3.7-Max"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$2.5/M in · $7.5/M out",
  },
  {
    id: "Qwen/Qwen3.7-Plus",
    label: "Qwen 3.7 Plus",
    provider: "Qwen",
    family: "qwen",
    aliases: ["qwen3.7-plus", "Qwen3.7-Plus", "alibaba/qwen3.7-plus"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.4/M in · $1.6/M out",
  },
  {
    id: "Qwen/Qwen3.7-Flash",
    label: "Qwen 3.7 Flash",
    provider: "Qwen",
    family: "qwen",
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.03/M in · $0.13/M out",
  },
  {
    id: "Qwen/Qwen3.6-Max-Preview",
    label: "Qwen 3.6 Max Preview",
    provider: "Qwen",
    family: "qwen",
    aliases: ["qwen3.6-max-preview", "Qwen3.6-Max-Preview"],
    enabledByDefault: false,
    notes: "$1.3/M in · $7.8/M out",
  },
  {
    id: "Qwen/Qwen3.6-Plus",
    label: "Qwen 3.6 Plus",
    provider: "Qwen",
    family: "qwen",
    aliases: ["qwen3.6-plus", "Qwen3.6-Plus"],
    enabledByDefault: true,
    notes: "$0.5/M in · $3/M out",
  },
  {
    id: "stepfun/Step-3.7-Flash",
    label: "Step 3.7 Flash",
    provider: "StepFun",
    family: "stepfun",
    aliases: ["step-3.7-flash", "Step-3.7-Flash"],
    contextWindow: 256_000,
    enabledByDefault: false,
    notes: "$0.2/M in · $1.15/M out",
  },
  {
    id: "stepfun/Step-3.5-Flash",
    label: "Step 3.5 Flash",
    provider: "StepFun",
    family: "stepfun",
    aliases: ["step-3.5-flash", "Step-3.5-Flash"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.1/M in · $0.3/M out",
  },
  {
    id: "tencent/hy3-paid",
    label: "Tencent Hy3",
    provider: "Tencent",
    family: "hy3",
    aliases: ["hy3-paid", "HY3-Paid"],
    contextWindow: 262_000,
    enabledByDefault: false,
    notes: "$0.14/M in · $0.58/M out",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    label: "Nemotron 3 Ultra",
    provider: "NVIDIA",
    family: "nemotron",
    aliases: ["nemotron-3-ultra-550b-a55b", "Nemotron-3-Ultra"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.6/M in · $2.4/M out",
  },
  {
    id: "thinkingmachines/inkling",
    label: "Inkling",
    provider: "Thinking Machines",
    family: "inkling",
    aliases: ["inkling"],
    contextWindow: 256_000,
    enabledByDefault: false,
    notes: "$1/M in · $4.05/M out",
  },
  {
    id: "thinkingmachines/inkling-small",
    label: "Inkling Small",
    provider: "Thinking Machines",
    family: "inkling",
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.5/M in · $1.2/M out",
  },
  {
    id: "poolside/laguna-s-2.1-free",
    label: "Laguna S 2.1",
    provider: "Poolside",
    family: "laguna",
    aliases: ["laguna-s-2.1-free", "Laguna-S-2.1-Free"],
    contextWindow: 256_000,
    enabledByDefault: false,
    notes: "$0/M in · $0/M out",
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "Anthropic",
    family: "claude",
    aliases: ["anthropic/claude-sonnet-5", "anthropic:claude-sonnet-5"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$2/M in · $10/M out",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
    family: "claude",
    aliases: ["anthropic/claude-sonnet-4.6", "claude-sonnet-4.6", "sonnet-4.6"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$3/M in · $15/M out",
  },
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    provider: "Anthropic",
    family: "claude",
    aliases: ["anthropic/claude-fable-5", "anthropic:claude-fable-5"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$10/M in · $50/M out",
  },
  {
    id: "claude-opus-5",
    label: "Claude Opus 5",
    provider: "Anthropic",
    family: "claude",
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$5/M in · $25/M out",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "Anthropic",
    family: "claude",
    aliases: [
      "anthropic/claude-opus-4.8",
      "claude-opus-4.8",
      "opus-4.8",
      "anthropic:claude-opus-4-8",
    ],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$5/M in · $25/M out",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "Anthropic",
    family: "claude",
    aliases: ["anthropic/claude-opus-4.7", "claude-opus-4.7", "opus-4.7"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$5/M in · $25/M out",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    family: "claude",
    aliases: ["anthropic/claude-haiku-4-5-20251001", "claude-haiku-4.5", "haiku-4.5"],
    contextWindow: 200_000,
    enabledByDefault: false,
    notes: "$1/M in · $5/M out",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.6-sol", "GPT-5.6-Sol"],
    contextWindow: 1_050_000,
    enabledByDefault: false,
    notes: "$5/M in · $30/M out",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.6-terra", "GPT-5.6-Terra"],
    contextWindow: 1_050_000,
    enabledByDefault: false,
    notes: "$1/M in · $6/M out",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.6-luna", "GPT-5.6-Luna"],
    contextWindow: 1_050_000,
    enabledByDefault: false,
    notes: "$0.1/M in · $0.6/M out",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.5", "GPT-5.5"],
    enabledByDefault: false,
    notes: "$5/M in · $30/M out",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.4", "GPT-5.4"],
    contextWindow: 400_000,
    enabledByDefault: false,
    notes: "$2.5/M in · $15/M out",
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.3-codex", "GPT-5.3-Codex"],
    contextWindow: 400_000,
    enabledByDefault: false,
    notes: "$2/M in · $8/M out",
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    provider: "OpenAI",
    family: "gpt",
    aliases: ["openai/gpt-5.4-mini", "GPT-5.4-Mini"],
    contextWindow: 400_000,
    enabledByDefault: false,
    notes: "$0.75/M in · $4.5/M out",
  },
  {
    id: "google/gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    provider: "Google",
    family: "gemini",
    aliases: ["gemini-3.6-flash", "Gemini-3.6-Flash"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$1.5/M in · $7.5/M out",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "Google",
    family: "gemini",
    aliases: ["gemini-3.5-flash", "Gemini-3.5-Flash"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$1.5/M in · $9/M out",
  },
  {
    id: "google/gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    provider: "Google",
    family: "gemini",
    aliases: ["gemini-3.5-flash-lite", "Gemini-3.5-Flash-Lite"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.3/M in · $2.5/M out",
  },
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "Google",
    family: "gemini",
    aliases: ["gemini-3.1-flash-lite", "Gemini-3.1-Flash-Lite"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$0.25/M in · $1.5/M out",
  },
  {
    id: "sakana/fugu-ultra",
    label: "Fugu Ultra",
    provider: "Sakana",
    family: "fugu",
    aliases: ["fugu-ultra", "Fugu-Ultra"],
    contextWindow: 1_000_000,
    enabledByDefault: false,
    notes: "$5/M in · $30/M out",
  },
  {
    id: "meta/muse-spark-1.1",
    label: "Muse Spark 1.1",
    provider: "Meta",
    family: "muse",
    aliases: ["muse-spark-1.1", "Muse-Spark-1.1"],
    contextWindow: 1_050_000,
    enabledByDefault: false,
    notes: "$1.25/M in · $4.25/M out",
  },
  {
    id: "meta/muse-spark-1.2",
    label: "Muse Spark 1.2",
    provider: "Meta",
    family: "muse",
    contextWindow: 1_050_000,
    enabledByDefault: false,
    notes: "$1.25/M in · $4.25/M out",
  },
  {
    id: "meta/muse-spark-1.2-contributor",
    label: "Muse Spark 1.2 Contributor",
    provider: "Meta",
    family: "muse",
    contextWindow: 1_050_000,
    enabledByDefault: false,
    notes: "$0.1/M in · $0.2/M out",
  },
  {
    id: "xai/grok-4.5",
    label: "Grok 4.5",
    provider: "xAI",
    family: "grok",
    aliases: ["grok-4.5", "Grok-4.5"],
    contextWindow: 500_000,
    enabledByDefault: false,
    notes: "$2/M in · $6/M out",
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
  if (model.contextWindow !== undefined) config.contextWindow = model.contextWindow;
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
    const contextWindow = override?.contextWindow ?? base.contextWindow;
    if (aliases) model.aliases = aliases;
    if (notes) model.notes = notes;
    if (typeof contextWindow === "number" && Number.isInteger(contextWindow) && contextWindow > 0) {
      model.contextWindow = contextWindow;
    }
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
    if (
      override.contextWindow !== undefined &&
      Number.isInteger(override.contextWindow) &&
      override.contextWindow > 0
    ) {
      model.contextWindow = override.contextWindow;
    }
    catalog.push(model);
  }

  return catalog;
}
