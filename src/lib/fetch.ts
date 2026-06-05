import { isInsecure } from "./config";

/**
 * Wrapper around global fetch that injects Bun TLS options when insecure mode is enabled.
 * This handles corporate/school networks with DPI/SSL inspection that present self-signed certs.
 */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const insecure = isInsecure();
  if (!insecure) {
    return fetch(url, init as RequestInit);
  }

  const options: any = { ...init };
  options.tls = {
    ...(init as any)?.tls,
    rejectUnauthorized: false,
  };

  return fetch(url, options);
}

export function isTlsError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("self signed certificate") ||
    msg.includes("self-signed certificate") ||
    msg.includes("unable to verify") ||
    msg.includes("certificate verify failed") ||
    msg.includes("unable to get local issuer certificate") ||
    (msg.includes("tls") && msg.includes("error")) ||
    (msg.includes("ssl") && msg.includes("error"))
  );
}

export function isConnectError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("unable to connect") ||
    msg.includes("connection refused") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("timeout") ||
    msg.includes("network is unreachable") ||
    msg.includes("fetch failed") ||
    msg.includes("abort") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED")
  );
}

export function formatNetworkError(err: unknown): string {
  const original = String(err);

  if (isTlsError(err)) {
    return (
      original +
      "\n\n" +
      "This looks like an SSL/TLS certificate error — common on corporate or school networks with DPI/inspection.\n" +
      "Try one of these fixes:\n" +
      "  • Set env var:   $env:NODE_TLS_REJECT_UNAUTHORIZED='0'   (PowerShell)\n" +
      "  • Set env var:   export NODE_TLS_REJECT_UNAUTHORIZED=0     (bash)\n" +
      "  • Enable permanently: or config --insecure\n" +
      "  • If your network uses a custom CA, ask IT for the cert and set NODE_EXTRA_CA_CERTS"
    );
  }

  if (isConnectError(err)) {
    return (
      original +
      "\n\n" +
      "Could not connect to the API. Possible causes:\n" +
      "  • Firewall, proxy, or network policy blocking the connection\n" +
      "  • DNS resolution failure\n" +
      "  • No internet connectivity\n" +
      "  • API outage\n\n" +
      "Try:\n" +
      "  • Check your connection:  ping openrouter.ai\n" +
      "  • Disable VPN/proxy temporarily\n" +
      "  • Switch networks (e.g., personal hotspot)\n" +
      "  • If on a restricted network, try: or config --insecure"
    );
  }

  return original;
}
