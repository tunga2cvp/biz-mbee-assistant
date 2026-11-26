import React, { useEffect, useState } from 'react';
import { CLOUD_URL, clearAuthSession, login, readAuthSession, validateAuthSession, type AuthSession } from '../services/authClient.js';
import { resetCloudChat } from '../services/cloudBackend.js';
import { tabSessions } from '../services/tabSessionStore.js';
import { tokenUsage } from '../services/tokenUsage.js';
import { cloudQuota } from '../services/cloudQuota.js';

function clearConversations() {
  for (const tabId of tabSessions.tabIds()) tabSessions.remove(tabId);
  resetCloudChat();
  tokenUsage.clear();
  cloudQuota.clear();
}
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    const restore = async () => {
      try {
        const saved = await readAuthSession();
        if (saved) await validateAuthSession(saved);
        if (!disposed) setSession(saved);
      } catch (reason) { if (!disposed) setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập.'); }
      finally { if (!disposed) setChecking(false); }
    };
    const changed = async () => {
      const current = await readAuthSession();
      if (!current) { clearConversations(); if (!disposed) setSession(null); }
      else if (!disposed) { clearConversations(); setSession(current); }
    };
    const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.mbeeSession) void changed();
    };
    chrome.storage.onChanged.addListener(storageChanged);
    window.addEventListener('mbee-auth-changed', changed);
    void restore();
    return () => { disposed = true; chrome.storage.onChanged.removeListener(storageChanged); window.removeEventListener('mbee-auth-changed', changed); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { clearConversations(); setSession(null); void clearAuthSession(); }, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { setSession(await login(username.trim(), password)); setPassword(''); }
    catch (reason) { setPassword(''); setError(reason instanceof Error ? reason.message : 'Không thể đăng nhập.'); }
    finally { setBusy(false); }
  };
  if (checking) return <div className="mbee-auth"><p role="status">Đang xác thực phiên…</p></div>;
  if (session) return <>
    <header className="mbee-account"><div className="mbee-brand"><img src="../icons/mbee48.png" alt="" /><div><strong>BIZ Mbee</strong><span>Trợ lý WebMCP · {session.username}</span></div></div><button onClick={() => { clearConversations(); setSession(null); void clearAuthSession(); }} title="Đăng xuất tài khoản trợ lý">Đăng xuất</button></header>
    {children}
  </>;
  return <main className="mbee-auth">
    <img className="mbee-auth__avatar" src="../icons/mbee128.png" alt="Mbee" />
    <h1>BIZ Mbee Assistant</h1><p>Đăng nhập bằng tài khoản trợ lý được cấp.</p>
    <form onSubmit={submit}>
      <label>Tên đăng nhập<input name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={64} disabled={busy} /></label>
      <label>Mật khẩu<input name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256} disabled={busy} /></label>
      {error && <p className="mbee-auth__error" role="alert">{error}</p>}
      <button className="mbee-auth__submit" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
    <p className="mbee-auth__privacy">Khi bạn chat, nội dung yêu cầu, mô tả công cụ và kết quả công cụ của trang sẽ được gửi tới Cloudflare Workers AI để xử lý.</p>
    <a href={`${CLOUD_URL}/privacy`} target="_blank" rel="noreferrer">Chính sách quyền riêng tư</a>
    <p className="mbee-auth__privacy">Tiện ích thử nghiệm do cá nhân phát triển.</p>
  </main>;
}
