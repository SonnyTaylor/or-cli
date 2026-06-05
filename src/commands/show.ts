import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey, getAAKey } from "../lib/config";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import {
  fetchModel,
  getModelModality,
  hasTools,
  hasReasoning,
  combinedPrice,
  isVisionModel,
  isEmbeddingModel,
  isPerImagePriced,
} from "../lib/openrouter";
import { fetchLLMBenchmarks } from "../lib/artificial-analysis";
import { getFormat, formatPriceStr, formatTps, modalityEmoji, formatCtxLong, formatAllPricing } from "../lib/format";
import { PRICING_FALLBACKS } from "../lib/pricing-fallbacks";
import type { GlobalOptions, ORModel } from "../lib/types";

interface Endpoint {
  provider_name: string;
  quantization?: string;
  context_length: number;
  max_completion_tokens?: number;
  pricing: Record<string, string>;
  uptime_last_1d?: number;
  uptime_last_30m?: number;
  latency_last_30m?: { p50: number };
  throughput_last_30m?: { p50: number };
  supports_implicit_caching: boolean;
  supported_parameters: string[];
}

export function showCommand(): Command {
  const cmd = new Command("show")
    .description("Show detailed information about a specific model")
    .argument("<model-id>", "Model ID (e.g. deepseek/deepseek-v4-flash)")
    .option("--benchmarks", "Include AA benchmark scores")
    .option("--json", "Output as JSON")
    .option("--no-cache", "Bypass cache")
    .action(async (modelId: string, opts: GlobalOptions & { benchmarks?: boolean }) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      const spinner = ora(`Fetching ${modelId}...`).start();

      try {
        // Fetch model and endpoints in parallel
        const [model, endpointsRes] = await Promise.all([
          fetchModel(apiKey, modelId),
          apiFetch(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          }).then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        // Some models (e.g. image gen with image pricing) aren't in /models
        // but ARE in /models/{id}/endpoints. Use endpoint data as fallback.
        const endpointData = (endpointsRes as any)?.data;
        const endpoints: Endpoint[] = endpointData?.endpoints ?? [];

        if (!model && endpoints.length === 0) {
          spinner.fail(`Model not found: ${modelId}`);
          console.log(
            chalk.dim(
              "Use `or models` to list available models, or `or models <query>` to search."
            )
          );
          process.exit(1);
        }

        // If model not in /models list but endpoints exist, construct minimal model info
        const m: ORModel =
          model ??
          ({
            id: endpointData.id,
            name: endpointData.name,
            description: endpointData.description,
            architecture: endpointData.architecture,
            context_length: endpoints[0]?.context_length ?? 0,
            pricing: {
              prompt: endpoints[0]?.pricing?.prompt ?? "0",
              completion: endpoints[0]?.pricing?.completion ?? "0",
            },
            top_provider: {
              max_completion_tokens: endpoints[0]?.max_completion_tokens,
              is_moderated: false,
            },
            supported_parameters: endpoints[0]?.supported_parameters ?? [],
            created: endpointData.created,
          } as ORModel);

        if (!model && endpoints.length > 0) {
          spinner.warn(
            `Not in /models list — found via endpoints (${endpoints.length} provider(s))`
          );
        }

        // Optionally fetch benchmarks
        let aaModel = null;
        if (opts.benchmarks) {
          const aaKey = getAAKey();
          if (aaKey) {
            try {
              const aaModels = await fetchLLMBenchmarks(aaKey, opts.noCache);
              aaModel =
                aaModels.find((bm) => bm.slug === m.id.split("/").pop()) ?? null;
            } catch (err) {
              spinner.warn(`Could not fetch benchmarks: ${err}`);
            }
          }
        }

        spinner.stop();

        if (format === "json") {
          console.log(
            JSON.stringify({ ...m, endpoints, benchmarks: aaModel }, null, 2)
          );
          return;
        }

        // ── Pretty print ──────────────────────────────────────────────────
        console.log("");
        console.log(chalk.bold.underline(m.id));
        console.log(chalk.dim(m.name));
        if ((m as any).expiration_date) {
          const expDate = new Date((m as any).expiration_date);
          const now = new Date();
          const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const expStr = daysLeft <= 0
            ? chalk.red(`EXPIRED`)
            : daysLeft <= 7
              ? chalk.yellow(`expires in ${daysLeft} day(s) — ${expDate.toLocaleDateString()}`)
              : chalk.dim(`expires ${expDate.toLocaleDateString()}`);
          console.log(chalk.bold('  ⚠ ') + expStr);
        }
        if (m.description) {
          const desc = m.description;
          console.log(
            chalk.dim(desc.length > 200 ? desc.slice(0, 197) + "..." : desc)
          );
        }
        console.log("");

        // ── Pricing ──────────────────────────────────────────────────────
        console.log(chalk.bold("  Pricing"));

        // Show model's headline pricing (all non-zero dimensions)
        const pricingLines = formatAllPricing(m.pricing);
        if (pricingLines.length > 0) {
          for (const line of pricingLines) {
            console.log(line);
          }
        } else {
          // Hardcoded fallback for models the API under-reports
          const fallback = PRICING_FALLBACKS[m.id];
          if (fallback) {
            console.log(`    ${fallback.label.padEnd(14)} ${fallback.value}`);
          } else {
            console.log("    free");
          }
        }

        // If multiple providers, show range for dimensions that vary
        if (endpoints.length > 1) {
          const headlineVals: Record<string, number> = {};
          for (const key of Object.keys(m.pricing)) {
            const v = parseFloat((m.pricing as any)[key] ?? "0");
            if (v > 0) headlineVals[key] = v;
          }

          const dims = ["prompt", "completion", "image_output", "audio_output", "request"];
          let showedRange = false;
          for (const dim of dims) {
            const vals = endpoints
              .map((e) => parseFloat((e.pricing as any)[dim] ?? "0"))
              .filter((n) => n > 0);
            if (vals.length <= 1) continue;
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            // Skip if all providers match the headline price (no variation)
            if (min === max && headlineVals[dim] === min) continue;
            showedRange = true;
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            const label = dim.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).padEnd(14);
            const unit = dim === "request" ? "" : "/ 1M tokens";
            const fmt = (n: number) =>
              dim === "request"
                ? n < 0.0001
                  ? "<$0.0001"
                  : n < 0.01
                    ? `$${n.toFixed(4)}`
                    : `$${n.toFixed(2)}`
                : formatPriceStr(n * 1_000_000);
            if (min === max) {
              console.log(`    ${label} ${fmt(min)}${unit ? " " + unit : ""}`);
            } else {
              console.log(`    ${label} ${fmt(min)} – ${fmt(max)}${unit ? " " + unit : ""}  (avg ${fmt(avg)})`);
            }
          }
          if (showedRange) {
            console.log(
              chalk.dim(
                `    (${endpoints.length} providers — run \`or endpoints ${modelId}\` for details)`
              )
            );
          }
        }
        console.log("");

        // ── Provider summary ──────────────────────────────────────────────
        if (endpoints.length > 0) {
          console.log(chalk.bold("  Providers"));
          const quantizations = [
            ...new Set(endpoints.map((e) => e.quantization ?? "unknown")),
          ];
          const uptimes = endpoints.map((e) => e.uptime_last_1d ?? 0);
          const bestUptime = Math.max(...uptimes);
          const worstUptime = Math.min(...uptimes);

          console.log(
            `    Count:         ${endpoints.length} providers`
          );
          console.log(
            `    Quantizations: ${quantizations.join(", ")}`
          );
          if (bestUptime > 0) {
            console.log(
              `    Uptime (1d):   ${worstUptime.toFixed(1)}% – ${bestUptime.toFixed(1)}%`
            );
          }
          if (endpoints.length > 1) {
            console.log(
              chalk.dim(`    💡 Tip: Use ${m.id}:exacto for quality-first provider routing`)
            );
          }
          console.log("");
        }

        // ── Specs ─────────────────────────────────────────────────────────
        console.log(chalk.bold("  Specs"));
        console.log(`    Context:     ${formatCtxLong(m.context_length)}`);
        console.log(
          `    Max output:  ${
            m.top_provider?.max_completion_tokens
              ? formatCtxLong(m.top_provider.max_completion_tokens)
              : "—"
          }`
        );
        console.log(
          `    Modality:    ${modalityEmoji(getModelModality(m))} ${getModelModality(m)}`
        );
        console.log(
          `    Moderated:   ${m.top_provider?.is_moderated ? "yes" : "no"}`
        );
        console.log("");

        // ── Capabilities ──────────────────────────────────────────────────
        console.log(chalk.bold("  Capabilities"));
        const caps: string[] = [];
        if (hasTools(m)) caps.push("🔧 Tool calling");
        if (hasReasoning(m)) {
          const effort = m.supported_parameters?.includes("reasoning_effort");
          caps.push(`🧠 Reasoning${effort ? " (low/medium/high effort)" : ""}`);
        }
        if (isVisionModel(m)) caps.push("👁 Vision");
        if (isEmbeddingModel(m)) caps.push("📐 Embeddings");
        if (m.supported_parameters?.includes("response_format"))
          caps.push("📋 JSON output");
        if (m.supported_parameters?.includes("structured_outputs"))
          caps.push("📋 Structured output");
        if (m.supported_parameters?.includes("temperature"))
          caps.push("🎛 Temperature");
        if (caps.length === 0) caps.push(chalk.dim("none detected"));
        for (const c of caps) {
          console.log(`    ${c}`);
        }
        console.log("");

        // ── Supported parameters ──────────────────────────────────────────
        if (m.supported_parameters?.length) {
          console.log(chalk.bold("  Supported parameters"));
          console.log(`    ${m.supported_parameters.join(", ")}`);
          console.log("");
        }

        // ── Benchmarks ────────────────────────────────────────────────────
        if (aaModel) {
          console.log(chalk.bold("  Artificial Analysis Benchmarks"));
          const e = aaModel.evaluations;

          // Core indices
          const core: [string, string | undefined][] = [
            ["Intelligence Index", e.artificial_analysis_intelligence_index?.toFixed(1)],
            ["Coding Index", e.artificial_analysis_coding_index?.toFixed(1)],
            ["Math Index", e.artificial_analysis_math_index?.toFixed(1)],
          ];
          for (const [label, val] of core) {
            if (val) console.log(`    ${label.padEnd(22)} ${val}`);
          }

          // All 12 individual benchmarks
          const benchmarks: [string, string | undefined][] = [
            ["MMLU Pro", pct(e.mmlu_pro)],
            ["GPQA", pct(e.gpqa)],
            ["HLE", pct(e.hle)],
            ["LiveCodeBench", pct(e.livecodebench)],
            ["SciCode", pct(e.scicode)],
            ["MATH 500", pct(e.math_500)],
            ["AIME", pct(e.aime)],
            ["AIME 25", pct(e.aime_25)],
            ["IFBench", pct(e.ifbench)],
            ["LCR", pct(e.lcr)],
            ["TerminalBench", pct(e.terminalbench_hard)],
            ["TAU2", pct(e.tau2)],
          ];
          for (const [label, val] of benchmarks) {
            if (val) console.log(`    ${label.padEnd(22)} ${val}`);
          }

          // Speed metrics
          if (aaModel.median_output_tokens_per_second !== undefined)
            console.log(`    ${"Speed".padEnd(22)} ${formatTps(aaModel.median_output_tokens_per_second)}`);
          if (aaModel.median_time_to_first_token_seconds !== undefined)
            console.log(`    ${"TTFT".padEnd(22)} ${aaModel.median_time_to_first_token_seconds.toFixed(2)}s`);
          console.log("");
        }
      } catch (err) {
        spinner.fail("Failed to fetch model");
        console.error(chalk.red(formatNetworkError(err)));
        process.exit(1);
      }
    });

  return cmd;
}



function pct(n: number | null | undefined): string | undefined {
  if (n == null) return undefined;
  return (n * 100).toFixed(1) + "%";
}
