export const CLOUD_URL = process.env.WEBMCP_CLOUD_URL || '';
const SESSION_KEY = 'mbeeSession';
export interface AuthSession { token: string; username: string; expiresAt: number }

export async function readAuthSession(): Promise<AuthSession | null> {
  const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as AuthSession | undefined;
  if (!stored || typeof stored.token !== 'string' || typeof stored.username !== 'string' || stored.expiresAt <= Date.now()) return null;
  return stored;
}
export async function clearAuthSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
  window.dispatchEvent(new Event('mbee-auth-changed'));
}
export async function login(username: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${CLOUD_URL}/extension/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    if (response.status === 429) throw Error('Bạn thử đăng nhập quá nhiều lần. Vui lòng chờ một phút.');
    if (response.status === 401) throw Error('Tên đăng nhập hoặc mật khẩu không đúng.');
    throw Error('Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại.');
  }
  const session = await response.json() as AuthSession;
  if (typeof session.token !== 'string' || typeof session.username !== 'string' || !Number.isFinite(session.expiresAt)) throw Error('Phản hồi đăng nhập không hợp lệ.');
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  return session;
}
export async function validateAuthSession(session: AuthSession): Promise<void> {
  const response = await fetch(`${CLOUD_URL}/extension/auth/session`, {
    headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) { await clearAuthSession(); throw Error('Phiên đã hết hạn. Vui lòng đăng nhập lại.'); }
  if (!response.ok) throw Error('Không thể xác thực phiên. Vui lòng thử lại khi có mạng.');
}
