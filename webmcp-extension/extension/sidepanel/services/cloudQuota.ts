import { CLOUD_URL, clearAuthSession, readAuthSession } from './authClient.js';

export type QuotaStatus = 'unknown' | 'available' | 'exhausted';
export interface QuotaSnapshot {
  status: QuotaStatus;
  checking: boolean;
  checkedAt: string | null;
  resetAt: string | null;
  error: string;
}
const empty = (): QuotaSnapshot => ({ status: 'unknown', checking: false, checkedAt: null, resetAt: null, error: '' });
export const nextQuotaReset = (now = Date.now()) => new Date((Math.floor(now / 86400000) + 1) * 86400000).toISOString();

export class QuotaStore {
  private state = empty();
  private epoch = 0;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  getEpoch = () => this.epoch;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<QuotaSnapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  clear() { this.epoch++; this.state = empty(); this.listeners.forEach(listener => listener()); }
  start() { this.update({ checking: true, error: '' }); return this.epoch; }
  report(status: QuotaStatus, resetAt: string | undefined, epoch: number, error = '', checkedAt = new Date().toISOString()) {
    if (epoch !== this.epoch) return;
    if (this.state.checkedAt && Date.parse(checkedAt) < Date.parse(this.state.checkedAt)) {
      this.update({ checking: false });
      return;
    }
    this.update({ status, resetAt: resetAt && Number.isFinite(Date.parse(resetAt)) ? resetAt : nextQuotaReset(), checkedAt, checking: false, error });
  }
  expire(now = Date.now()) {
    if (!this.state.checking && this.state.checkedAt &&
      ((this.state.resetAt && now >= Date.parse(this.state.resetAt)) ||
       (this.state.status === 'available' && now - Date.parse(this.state.checkedAt) >= 300000))) {
      this.update({ status: 'unknown', checkedAt: null, error: '' });
    }
  }
}
export const cloudQuota = new QuotaStore();

export async function checkCloudQuota(): Promise<void> {
  if (cloudQuota.getSnapshot().checking) return;
  const epoch = cloudQuota.start();
  try {
    const session = await readAuthSession();
    if (!session) throw Error('Vui lòng đăng nhập để kiểm tra.');
    const response = await fetch(`${CLOUD_URL}/extension/quota/check`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401) { await clearAuthSession(); return; }
    if (response.status === 429) throw Error('Bạn vừa kiểm tra hoặc gửi quá nhiều yêu cầu. Thử lại sau một phút.');
    if (!response.ok) throw Error('Chưa kiểm tra được hạn mức. Thử lại sau.');
    const result = await response.json();
    if (!['unknown', 'available', 'exhausted'].includes(result.status) || typeof result.checkedAt !== 'string' || !Number.isFinite(Date.parse(result.checkedAt))) {
      throw Error('Chưa nhận được kết quả kiểm tra hợp lệ.');
    }
    cloudQuota.report(result.status, result.resetAt, epoch, typeof result.message === 'string' ? result.message : '', result.checkedAt);
  } catch (error) {
    cloudQuota.report('unknown', undefined, epoch, error instanceof Error ? error.message : 'Không thể kiểm tra lúc này.');
  }
}
