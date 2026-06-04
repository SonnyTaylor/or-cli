// ── OpenRouter API Types ─────────────────────────────────────────────────────

export interface ORModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider: {
    max_completion_tokens?: number;
    is_moderated: boolean;
  };
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
  supported_parameters: string[];
  created: number;
  expiration_date?: string; // YYYY-MM-DD format, model is going away
  knowledge_cutoff?: string;
}

export interface ORProvider {
  id: string;
  name: string;
  slug: string;
}

export interface ORModelEndpoint {
  id: string;
  provider_id: string;
  provider_name: string;
  quantization?: string;
  context_length: number;
  max_completion_tokens?: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  uptime_1d?: number;
  uptime_30m?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  response_format?: { type: "json_object" | "json_schema"; json_schema?: object };
  reasoning?: { effort: "low" | "medium" | "high" };
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
      reasoning?: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider?: string;
}

// ── Artificial Analysis API Types ────────────────────────────────────────────

export interface AAModel {
  id: string;
  name: string;
  slug: string;
  model_creator: {
    id: string;
    name: string;
    slug?: string;
  };
  evaluations: {
    artificial_analysis_intelligence_index?: number;
    artificial_analysis_coding_index?: number;
    artificial_analysis_math_index?: number;
    mmlu_pro?: number;
    gpqa?: number;
    hle?: number;
    livecodebench?: number;
    scicode?: number;
    math_500?: number;
    aime?: number;
  };
  pricing: {
    price_1m_blended_3_to_1?: number;
    price_1m_input_tokens?: number;
    price_1m_output_tokens?: number;
  };
  median_output_tokens_per_second?: number;
  median_time_to_first_token_seconds?: number;
}

export interface AAMediaModel {
  id: string;
  name: string;
  slug?: string;
  model_creator: {
    id: string;
    name: string;
    slug?: string;
  };
  elo: number;
  rank: number;
  ci95?: string;
  appearances?: number;
  release_date?: string;
  categories?: {
    style_category?: string;
    subject_matter_category?: string;
    format_category?: string;
    elo: number;
    ci95?: string;
    appearances?: number;
  }[];
}

export type AAMediaEndpoint =
  | "text-to-image"
  | "image-editing"
  | "text-to-speech"
  | "text-to-video"
  | "image-to-video";

// ── CLI Types ────────────────────────────────────────────────────────────────

export type OutputFormat = "table" | "json" | "md";

export interface GlobalOptions {
  json?: boolean;
  md?: boolean;
  quiet?: boolean;
  noCache?: boolean;
}

export interface ModelInfo {
  // From OpenRouter
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  modality: string;
  inputPrice: number;  // per 1M tokens
  outputPrice: number; // per 1M tokens
  combinedPrice: number;
  supportedParams: string[];
  hasTools: boolean;
  hasVision: boolean;
  hasReasoning: boolean;
  hasStreaming: boolean;
  // From AA (optional)
  aaIntelligence?: number;
  aaCoding?: number;
  aaMath?: number;
  aaSpeed?: number;  // tokens/sec
  aaLatency?: number; // TTFT seconds
}
