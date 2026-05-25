import { AnthropicAdapter } from "@/lib/adapters/anthropic";
import { OpenAIAdapter } from "@/lib/adapters/openai";
import type { ProviderAdapter } from "@/lib/adapters/base";
import type { ApiMode } from "@/lib/types";

export function getAdapter(mode: ApiMode): ProviderAdapter {
  return mode === "anthropic" ? new AnthropicAdapter() : new OpenAIAdapter();
}
