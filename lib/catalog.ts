import 'server-only';
import { createProxy } from './proxy.mjs';
import type { Catalog } from './types';

// Short timeout: a slow or cold backend must not stall page generation.
// The client falls back to /api/cases when this returns null.
const proxy = createProxy({ timeoutMs: 8_000, allowLocalhost: process.env.MAUM_ALLOW_LOCAL_BACKEND === '1' });

export async function getCatalog(): Promise<Catalog | null> {
  try {
    const response = await proxy(new Request('https://maum.internal/api/cases'));
    if (!response.ok) return null;
    const data = (await response.json()) as Catalog;
    return Array.isArray(data.cases) && data.cases.length ? data : null;
  } catch {
    return null;
  }
}
