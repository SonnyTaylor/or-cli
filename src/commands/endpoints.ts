import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey } from "../lib/config";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import { getFormat, outputTable, formatPriceStr, truncate, formatPercent, formatCtx } from "../lib/format";
import type { GlobalOptions } from "../lib/types";

interface Endpoint {
  name: string;
  model_id: string;
  model_name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    discount?: number;
  };
  provider_name: string;
  tag?: string;
  quantization?: string;
  max_completion_tokens?: number;
  supported_parameters: string[];
  status: number;
  uptime_last_30m?: number;
  uptime_last_1d?: number;
  supports_implicit_caching: boolean;
  latency_last_30m?: {
    p50: number;
    p75: number;
    p90: number;
    p99: number;
  };
  throughput_last_30m?: {
    p50: number;
    p75: number;
    p90: number;
    p99: number;
  };
}

interface EndpointResponse {
  data: {
    id: string;
    name: string;
    description?: string;
    endpoints: Endpoint[];
  };
}

export function endpointsCommand(): Command {
  const cmd = new Command("endpoints")
    .description("Show provider endpoints for a model (uptime, latency, quantization)")
    .argument("<model-id>", "Model ID (e.g. deepseek/deepseek-v4-flash)")
    .option("--sort <field>", "Sort by: uptime, latency, throughput, price, provider", "uptime")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quantization <type>", "Filter by quantization (fp8, fp4, bf16, unknown)")
    .option("--provider <name>", "Filter by provider name")
    .option("--min-uptime <pct>", "Min uptime % (1d)", parseFloat)
    .option("--max-latency <ms>", "Max p50 latency in ms", parseInt)
    .option("--min-throughput <tps>", "Min p50 throughput in tokens/sec", parseInt)
    .option("--caching", "Only endpoints with implicit caching support")
    .option("--param <param...>", "Filter by supported parameter")
    .action(async (modelId: string, opts: GlobalOptions & {
      sort?: string;
      quantization?: string;
      provider?: string;
      minUptime?: number;
      maxLatency?: number;
      minThroughput?: number;
      caching?: boolean;
      param?: string[];
    }) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);

      const spinner = ora(`Fetching endpoints for ${modelId}...`).start();

      try {
        const res = await apiFetch(
          `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          spinner.fail(`Failed: ${res.status}`);
          console.error(body);
          process.exit(1);
        }

        const data = (await res.json()) as EndpointResponse;
        let endpoints = data.data.endpoints;

        if (!endpoints || endpoints.length === 0) {
          spinner.fail(`No endpoints found for ${modelId}`);
          process.exit(1);
        }

        // Apply filters
        if (opts.quantization) {
          const q = opts.quantization.toLowerCase();
          endpoints = endpoints.filter((e) => (e.quantization?.toLowerCase() ?? "") === q);
        }
        if (opts.provider) {
          const p = opts.provider.toLowerCase();
          endpoints = endpoints.filter((e) => e.provider_name.toLowerCase().includes(p));
        }
        if (opts.minUptime !== undefined) {
          endpoints = endpoints.filter((e) => (e.uptime_last_1d ?? 0) >= opts.minUptime!);
        }
        if (opts.maxLatency !== undefined) {
          endpoints = endpoints.filter((e) =>
            (e.latency_last_30m?.p50 ?? 99999) <= opts.maxLatency!
          );
        }
        if (opts.minThroughput !== undefined) {
          endpoints = endpoints.filter((e) =>
            (e.throughput_last_30m?.p50 ?? 0) >= opts.minThroughput!
          );
        }
        if (opts.caching) {
          endpoints = endpoints.filter((e) => e.supports_implicit_caching);
        }
        if (opts.param && opts.param.length > 0) {
          endpoints = endpoints.filter((e) =>
            opts.param!.every((p) => e.supported_parameters?.includes(p))
          );
        }

        // Sort
        endpoints = sortEndpoints(endpoints, opts.sort ?? "uptime");

        spinner.stop();

        if (format === "json") {
          console.log(JSON.stringify({ model: data.data, endpoints }, null, 2));
          return;
        }

        console.log("");
        console.log(chalk.bold.underline(data.data.id));
        console.log(chalk.dim(data.data.name));
        console.log("");

        if (format === "table" || format === "md") {
          const headers = [
            "Provider",
            "Quant",
            "Context",
            "Max Out",
            "Input/M",
            "Output/M",
            "Cache/M",
            "Uptime 1d",
            "Uptime 30m",
            "Latency p50",
            "Throughput",
            "Caching",
          ];

          const rows = endpoints.map((e) => [
            e.provider_name,
            e.quantization ?? "—",
            formatCtx(e.context_length),
            e.max_completion_tokens ? formatCtx(e.max_completion_tokens) : "—",
            formatPriceStr(parseFloat(e.pricing.prompt) * 1_000_000),
            formatPriceStr(parseFloat(e.pricing.completion) * 1_000_000),
            e.pricing.input_cache_read
              ? formatPriceStr(parseFloat(e.pricing.input_cache_read) * 1_000_000)
              : "—",
            e.uptime_last_1d !== undefined ? formatPercent(e.uptime_last_1d) : "—",
            e.uptime_last_30m !== undefined ? formatPercent(e.uptime_last_30m) : "—",
            e.latency_last_30m ? `${e.latency_last_30m.p50}ms` : "—",
            e.throughput_last_30m ? `${e.throughput_last_30m.p50} t/s` : "—",
            e.supports_implicit_caching ? "✓" : "",
          ]);

          outputTable(headers, rows, format);

          if (format === "table") {
            console.log(chalk.dim(`\n  ${endpoints.length} endpoints`));
          }
        }
      } catch (err) {
        spinner.fail("Failed to fetch endpoints");
        console.error(chalk.red(formatNetworkError(err)));
        process.exit(1);
      }
    });

  return cmd;
}

function sortEndpoints(endpoints: Endpoint[], sort: string): Endpoint[] {
  switch (sort) {
    case "uptime":
      return [...endpoints].sort(
        (a, b) => (b.uptime_last_1d ?? 0) - (a.uptime_last_1d ?? 0)
      );
    case "latency":
      return [...endpoints].sort(
        (a, b) =>
          (a.latency_last_30m?.p50 ?? 99999) - (b.latency_last_30m?.p50 ?? 99999)
      );
    case "throughput":
      return [...endpoints].sort(
        (a, b) =>
          (b.throughput_last_30m?.p50 ?? 0) - (a.throughput_last_30m?.p50 ?? 0)
      );
    case "price":
      return [...endpoints].sort(
        (a, b) =>
          parseFloat(a.pricing.prompt) +
          parseFloat(a.pricing.completion) -
          (parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion))
      );
    case "provider":
      return [...endpoints].sort((a, b) =>
        a.provider_name.localeCompare(b.provider_name)
      );
    default:
      return endpoints;
  }
}


