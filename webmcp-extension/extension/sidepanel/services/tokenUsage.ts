export interface ReportedUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}
export interface TokenTally {
  requests: number;
  missing: number;
  input: number;
  output: number;
  total: number;
  cached: number;
  reasoning: number;
}
export interface TokenUsageState {
  total: TokenTally;
  models: Record<string, TokenTally>;
  last: { model: string; input: number | null; output: number | null; total: number | null } | null;
}
const emptyTally = (): TokenTally => ({ requests: 0, missing: 0, input: 0, output: 0, total: 0, cached: 0, reasoning: 0 });
const emptyState = (): TokenUsageState => ({ total: emptyTally(), models: {}, last: null });
const count = (value: number | undefined): number | null => Number.isSafeInteger(value) && value! >= 0 ? value! : null;

/** Counts numeric provider usage only; never estimates from text or retains chat content. */
export class TokenUsageStore {
  private state = emptyState();
  private epoch = 0;
  private listeners = new Set<() => void>();
  getSnapshot = (): TokenUsageState => this.state;
  getEpoch = (): number => this.epoch;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  clear = (): void => { this.epoch++; this.state = emptyState(); this.emit(); };

  record(model: string, usage: ReportedUsage | undefined, epoch = this.epoch): void {
    if (epoch !== this.epoch) return;
    const input = count(usage?.inputTokens);
    const output = count(usage?.outputTokens);
    const total = count(usage?.totalTokens) ?? (input !== null && output !== null ? input + output : null);
    const increment: TokenTally = {
      requests: 1, missing: input === null || output === null || total === null ? 1 : 0,
      input: input ?? 0, output: output ?? 0, total: total ?? 0,
      cached: count(usage?.inputTokenDetails?.cacheReadTokens) ?? 0,
      reasoning: count(usage?.outputTokenDetails?.reasoningTokens) ?? 0,
    };
    const add = (previous: TokenTally): TokenTally => Object.fromEntries(
      Object.entries(increment).map(([key, value]) => [key, previous[key as keyof TokenTally] + value])
    ) as unknown as TokenTally;
    this.state = { total: add(this.state.total), models: { ...this.state.models, [model]: add(this.state.models[model] || emptyTally()) }, last: { model, input, output, total } };
    this.emit();
  }
  private emit(): void { for (const listener of this.listeners) listener(); }
}
export const tokenUsage = new TokenUsageStore();
