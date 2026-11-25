import { useSyncExternalStore } from 'react';
import { CLOUD_MODELS } from '../services/cloudModel.js';
import { tokenUsage } from '../services/tokenUsage.js';

const number = (value: number | null) => value === null ? 'Chưa có số liệu' : value.toLocaleString('vi-VN');
const label = (id: string) => CLOUD_MODELS.find(model => model.id === id)?.label || id;

export function TokenUsage() {
  const usage = useSyncExternalStore(tokenUsage.subscribe, tokenUsage.getSnapshot, tokenUsage.getSnapshot);
  return <details className="mbee-token-usage" data-testid="token-usage" data-requests={usage.total.requests} data-input={usage.total.input} data-output={usage.total.output} data-total={usage.total.total} data-missing={usage.total.missing}>
    <summary>Token đã ghi nhận: <strong>{number(usage.total.total)}</strong> · {usage.total.requests} lượt model</summary>
    {usage.last && <p>Lượt model gần nhất ({label(usage.last.model)}): vào {number(usage.last.input)} · ra {number(usage.last.output)} · tổng {number(usage.last.total)}.</p>}
    {usage.total.requests > 0 && <table>
      <caption>Tổng từ khi mở panel, theo model</caption>
      <thead><tr><th>Model</th><th>Vào</th><th>Ra</th><th>Tổng</th></tr></thead>
      <tbody>{Object.entries(usage.models).map(([id, tally]) => <tr key={id} data-model={id} data-requests={tally.requests} data-total={tally.total}>
        <th scope="row">{label(id)}</th><td>{number(tally.input)}</td><td>{number(tally.output)}</td><td>{number(tally.total)}</td>
      </tr>)}</tbody>
    </table>}
    {usage.total.cached > 0 && <p>Input cache: {number(usage.total.cached)} token (đã nằm trong số token vào).</p>}
    {usage.total.reasoning > 0 && <p>Reasoning: {number(usage.total.reasoning)} token (đã nằm trong số token ra).</p>}
    {usage.total.missing > 0 && <p role="status">Có {usage.total.missing} lượt chưa nhận đủ usage; tổng trên chỉ gồm số đã ghi nhận.</p>}
    <p>Số liệu Cloudflare trả về, gồm prompt hệ thống, lịch sử chat, mô tả và kết quả tool. Một yêu cầu chat có thể dùng nhiều lượt model.</p>
    <p>Thống kê trong panel này; đặt lại khi đóng/nạp lại panel hoặc đăng xuất. Lượt lỗi/hủy có thể thiếu usage. Không phải tổng hóa đơn Cloudflare.</p>
  </details>;
}
