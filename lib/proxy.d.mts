export interface ProxyOptions {
  backendUrl?: string;
  secret?: string;
  allowLocalhost?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}
export function createProxy(options?: ProxyOptions): (request: Request) => Promise<Response>;
export const proxy: (request: Request) => Promise<Response>;
