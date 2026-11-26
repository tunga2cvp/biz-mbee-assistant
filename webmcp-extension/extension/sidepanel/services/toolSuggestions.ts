import type { WebMCPTool } from '../types/index.js';
/** Only prepares a prompt; never executes a tool or invents its arguments. */
export function toolSuggestions(tools: WebMCPTool[]) {
  const seen = new Set<string>();
  const suggestions = tools.filter(tool => {
    if (!tool.name || seen.has(tool.name)) return false;
    seen.add(tool.name); return true;
  }).map(tool => {
    const name = tool.name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const label = /search|find|lookup/.test(name) ? 'Tìm kiếm thông tin'
      : /fill|prefill/.test(name) ? 'Điền thông tin biểu mẫu'
      : /calcul|estimate/.test(name) ? 'Tính toán, ước tính'
      : /add.*cart/.test(name) ? 'Thêm vào giỏ hàng'
      : /order|checkout/.test(name) ? 'Tạo hoặc gửi đơn hàng'
      : /book|reserv/.test(name) ? 'Đặt dịch vụ'
      : /save|draft/.test(name) ? 'Lưu thông tin'
      : /get|list|view|read/.test(name) || tool.readOnlyHint ? 'Xem thông tin trên trang'
      : 'Sử dụng công cụ của trang';
    return { toolName: tool.name, label, detail: (tool.description || tool.name).slice(0, 140),
      prompt: `Tôi muốn sử dụng công cụ "${tool.name}". Hãy hỏi tôi những thông tin còn thiếu và xác nhận nội dung trước khi thực hiện.`,
    };
  });
  const selected: typeof suggestions = [];
  for (const item of suggestions) if (!selected.some(other => other.label === item.label)) selected.push(item);
  for (const item of suggestions) if (!selected.includes(item)) selected.push(item);
  return selected.slice(0, 3);
}
