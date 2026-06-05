import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { requireOpenRouterKey } from "../lib/config";
import { getCached, setCache } from "../lib/cache";
import { getConfig } from "../lib/config";
import { apiFetch, formatNetworkError } from "../lib/fetch";
import { getFormat, outputTable, truncate } from "../lib/format";
import type { GlobalOptions } from "../lib/types";

interface Provider {
  name: string;
  slug: string;
  privacy_policy_url?: string;
  terms_of_service_url?: string;
  status_page_url?: string;
  headquarters?: string;
  datacenters?: string[];
}

export function providersCommand(): Command {
  const cmd = new Command("providers")
    .description("List OpenRouter providers and their datacenter locations")
    .option("--region <region>", "Filter by datacenter region (e.g. US, EU, SG, CN)")
    .option("--headquarters <country>", "Filter by headquarters country")
    .option("--search <query>", "Search provider names")
    .option("--json", "Output as JSON")
    .option("--md", "Output as Markdown table")
    .option("--quiet", "Suppress non-error output")
    .option("--no-cache", "Bypass cache")
    .action(async (opts: GlobalOptions & {
      region?: string;
      headquarters?: string;
      search?: string;
    }) => {
      const apiKey = requireOpenRouterKey();
      const format = getFormat(opts);
      const cacheTtl = getConfig().cacheTtlMs;

      const spinner = opts.quiet ? null : ora("Fetching providers...").start();

      try {
        let providers: Provider[];

        if (!opts.noCache) {
          const cached = getCached<Provider[]>("or-providers", {}, cacheTtl);
          if (cached) {
            providers = cached;
          } else {
            providers = await fetchProviders(apiKey);
            setCache("or-providers", {}, providers, cacheTtl);
          }
        } else {
          providers = await fetchProviders(apiKey);
          setCache("or-providers", {}, providers, cacheTtl);
        }

        // Apply filters
        if (opts.region) {
          const region = opts.region.toUpperCase();
          providers = providers.filter((p) =>
            p.datacenters?.some((d) => d.toUpperCase().includes(region))
          );
        }

        if (opts.headquarters) {
          const hq = opts.headquarters.toUpperCase();
          providers = providers.filter((p) =>
            p.headquarters?.toUpperCase().includes(hq)
          );
        }

        if (opts.search) {
          const q = opts.search.toLowerCase();
          providers = providers.filter((p) =>
            p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
          );
        }

        // Sort alphabetically
        providers.sort((a, b) => a.name.localeCompare(b.name));

        spinner?.stop();

        if (providers.length === 0) {
          console.log(chalk.dim("No providers match your filters."));
          return;
        }

        if (format === "json") {
          console.log(JSON.stringify(providers, null, 2));
          return;
        }

        const headers = ["Provider", "Slug", "HQ", "Datacenters", "Privacy", "Status"];
        const rows = providers.map((p) => [
          truncate(p.name, 25),
          p.slug,
          p.headquarters ?? "—",
          p.datacenters?.join(", ") ?? "—",
          p.privacy_policy_url ? "✓" : "—",
          p.status_page_url ? "✓" : "—",
        ]);

        outputTable(headers, rows, format);

        if (format === "table") {
          console.log(chalk.dim(`\n  ${providers.length} providers`));
        }
      } catch (err) {
        spinner?.fail("Failed to fetch providers");
        console.error(chalk.red(formatNetworkError(err)));
        process.exit(1);
      }
    });

  return cmd;
}

async function fetchProviders(apiKey: string): Promise<Provider[]> {
  const res = await apiFetch("https://openrouter.ai/api/v1/providers", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch providers: ${res.status}`);
  }
  const data = (await res.json()) as { data: Provider[] };
  return data.data;
}
