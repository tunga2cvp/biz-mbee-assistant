import { uiText } from '../services/uiText.js';
import { useSyncExternalStore } from 'react';
import { CLOUD_MODELS } from '../services/cloudModel.js';
import { tokenUsage } from '../services/tokenUsage.js';

const number = (value: number | null) => value === null ? 'Chưa có số liệu' : value.toLocaleString('vi-VN');
const label = (id: string) => CLOUD_MODELS.find(model => model.id === id)?.label || id;
const neurons = (id: string, input: number, output: number) => {
  const model = CLOUD_MODELS.find(model => model.id === id);
  return model ? (input * model.inputNeuronsPerMillion + output * model.outputNeuronsPerMillion) / 1000000 : 0;
};

export function TokenUsage() {
  const usage = useSyncExternalStore(tokenUsage.subscribe, tokenUsage.getSnapshot, tokenUsage.getSnapshot);
  return <details className="mbee-token-usage" data-testid="token-usage" data-requests={usage.total.requests} data-input={usage.total.input} data-output={usage.total.output} data-total={usage.total.total} data-missing={usage.total.missing}>
    <summary>Token đã ghi nhận: <strong>{number(usage.total.total)}</strong> · {usage.total.requests} lượt gọi AI</summary>
    {usage.total.requests > 0 && <p className="mbee-neuron-estimate">≈ {Object.entries(usage.models).reduce((sum, [id, tally]) => sum + neurons(id, tally.input, tally.output), 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} neurons trong phiên này <span>· ước tính theo token, chưa điều chỉnh cache; không phải hạn mức còn lại</span></p>}
    {usage.last && <p>Lượt gọi AI gần nhất ({label(usage.last.model)}): vào {number(usage.last.input)} · ra {number(usage.last.output)} · tổng {number(usage.last.total)}.</p>}
    {usage.total.requests > 0 && <table>
      <caption>Tổng phiên này, theo mô hình</caption>
      <thead><tr><th>{uiText("Model", "Mô hình AI")}</th><th>Vào</th><th>Ra</th><th>Tổng</th></tr></thead>
      <tbody>{Object.entries(usage.models).map(([id, tally]) => <tr key={id} data-model={id} data-requests={tally.requests} data-total={tally.total}>
        <th scope="row">{label(id)}</th><td>{number(tally.input)}</td><td>{number(tally.output)}</td><td>{number(tally.total)}</td>
      </tr>)}</tbody>
    </table>}
    {usage.total.cached > 0 && <p>Token đầu vào từ bộ nhớ đệm: {number(usage.total.cached)} token (đã nằm trong số token vào).</p>}
    {usage.total.reasoning > 0 && <p>Token suy luận: {number(usage.total.reasoning)} token (đã nằm trong số token ra).</p>}
    {usage.total.missing > 0 && <p role="status">Có {usage.total.missing} lượt chưa nhận đủ số liệu token; tổng trên chỉ gồm số đã ghi nhận.</p>}
    <p>Số liệu Cloudflare trả về, gồm chỉ dẫn hệ thống, lịch sử chat, mô tả và kết quả công cụ. Một yêu cầu chat có thể dùng nhiều lượt gọi AI.</p>
    <p>Thống kê trong bảng trợ lý này; đặt lại khi đóng/mở lại bảng trợ lý hoặc đăng xuất. Lượt lỗi/hủy có thể thiếu số liệu token. Không phải tổng hóa đơn Cloudflare.</p>
  </details>;
}
