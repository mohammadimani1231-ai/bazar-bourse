export interface SourcePingResult {
  source: string;
  ok: boolean;
  latencyMs: number;
  sample?: unknown;
  error?: string;
}
