import { uiText } from '../services/uiText.js';
import { useEffect, useSyncExternalStore } from 'react';
import { CLOUD_MODELS } from '../services/cloudModel.js';
import { checkCloudQuota, cloudQuota } from '../services/cloudQuota.js';
import { TokenUsage } from './TokenUsage.js';

const format = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
export function CloudControls({ model, busy, changed, onModelChange }: {
  model: string; busy: boolean; changed: boolean; onModelChange: (id: string) => void;
}) {
  const selected = CLOUD_MODELS.find(item => item.id === model)!;
  const quota = useSyncExternalStore(cloudQuota.subscribe, cloudQuota.getSnapshot, cloudQuota.getSnapshot);
  useEffect(() => { cloudQuota.expire(); const timer = setInterval(() => cloudQuota.expire(), 30000); return () => clearInterval(timer); }, []);
  const quotaLabel = quota.checking ? 'Đang kiểm tra…' : quota.status === 'exhausted' ? 'Đã hết hạn mức hôm nay' : quota.status === 'available' ? 'AI đang khả dụng' : 'Hạn mức chưa kiểm tra';
  return <div className="mbee-controls">
    <div className="mbee-model-picker">
      <div className="mbee-model-label"><label htmlFor="mbee-cloud-model">MÔ HÌNH AI</label><span className="mbee-model-badge">{selected.badge}</span></div>
      <select id="mbee-cloud-model" value={model} disabled={busy} aria-describedby="mbee-model-hint"
        onChange={event => onModelChange(event.target.value)}>
        {CLOUD_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <p id="mbee-model-hint">{selected.description}</p>
      {(busy || changed) && <p className="mbee-model-notice" role="status">{busy ? 'Chờ tác vụ hoàn tất để đổi model.' : 'Đã đổi model · Hội thoại mới đã sẵn sàng.'}</p>}
    </div>
    <div className={`mbee-quota mbee-quota--${quota.status}`}>
      <div className="mbee-quota__label" role="status"><span className="mbee-status-dot" /><span>{quotaLabel}</span></div>
      <button type="button" onClick={() => void checkCloudQuota()} disabled={quota.checking || busy}
        title="Gửi một phép thử AI rất nhỏ để kiểm tra hạn mức; phép thử cũng dùng neurons." aria-label="Kiểm tra hạn mức AI">
        <span aria-hidden="true" className={quota.checking ? 'mbee-refresh mbee-refresh--spinning' : 'mbee-refresh'}>↻</span> Kiểm tra
      </button>
    </div>
    {quota.status === 'exhausted' && <p className="mbee-quota-note">Đặt lại lúc 07:00 giờ Việt Nam. Đổi model không đặt lại hạn mức.</p>}
    {quota.error && <p className="mbee-quota-error" role="alert">{quota.error}</p>}
    <details className="mbee-activity">
      <summary><span>Hoạt động & hạn mức</span><span aria-hidden="true">⌄</span></summary>
      <div className="mbee-activity__body">
        <TokenUsage />
        <div className="mbee-quota-details">
          <h3>Hạn mức miễn phí dùng chung</h3>
          <p><strong>10.000 neurons / ngày</strong> cho toàn bộ model và các ứng dụng cùng tài khoản Cloudflare.</p>
          <p>Kiểm tra dùng một lượt AI tối đa 1 token đầu ra. Kết quả cho biết có gọi được AI ở thời điểm kiểm tra; chưa có số neurons còn lại chính xác.</p>
          {quota.checkedAt && <p>Kiểm tra gần nhất: {new Date(quota.checkedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.</p>}
          <h3>So sánh mức dùng ước tính</h3>
          <p>Cùng 1.000 token vào + 200 token ra, chưa tính khác biệt cache:</p>
          <table className="mbee-model-cost"><thead><tr><th>{uiText("Model", "Mô hình AI")}</th><th>Neurons ≈</th></tr></thead>
            <tbody>{CLOUD_MODELS.map(item => <tr key={item.id} className={item.id === model ? 'is-selected' : ''}><td>{item.label}</td><td>{format((item.inputNeuronsPerMillion * 1000 + item.outputNeuronsPerMillion * 200) / 1000000)}</td></tr>)}</tbody>
          </table>
          <p>Model nhỏ có thể cần nhiều lượt hơn. Chọn Granite cho việc đơn giản; dùng model lớn khi tác vụ cần nhiều suy luận.</p>
          <a href="https://developers.cloudflare.com/workers-ai/platform/pricing/" target="_blank" rel="noreferrer">Bảng giá Cloudflare · 26/11/2026 ↗</a>
        </div>
      </div>
    </details>
  </div>;
}
