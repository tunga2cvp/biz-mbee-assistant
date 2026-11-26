# BIZ Mbee Assistant

Tiện ích Chrome thử nghiệm WebMCP do cá nhân phát triển. Phiên bản mới nhất trong source: **1.3.1**.

[Chrome Web Store](https://chromewebstore.google.com/detail/biz-mbee-assistant/opifljgebjckcihkflechmdolimljfln):
ngày 25/11/2026 đã xác nhận **1.1.0 công khai**; bản cập nhật **1.2.1 đang chờ Google duyệt**,
tự động xuất bản khi được chấp thuận.

- Đăng nhập bằng tài khoản trợ lý do chủ Worker cấp.
- Khám phá và gọi công cụ WebMCP do website công bố; kiểm tra quyền trước khi thực hiện.
- Chọn Qwen 3.8 27B hoặc Granite 4.0 H Micro 3B trên Cloudflare Workers AI.
- Hội thoại riêng theo tab; đổi model bắt đầu hội thoại mới.
- Hiển thị token đầu vào, đầu ra và tổng theo model, gồm các lượt gọi tool.

Website cần tích hợp WebMCP. Bản này chưa có chức năng đọc toàn bộ nội dung DOM hoặc tự bấm nút
trên các trang không công bố công cụ. Tài khoản trợ lý tách biệt với tài khoản của website.

Bản 1.3.1 Việt hóa giao diện và gợi ý tối đa ba tác vụ từ công cụ WebMCP của trang.
Chọn mô hình, quota và thống kê nằm trong Cài đặt. Hỗ trợ Qwen, Granite, Gemma 4 A4B và GLM 4.7 Flash.
Worker `c3c47479` đã triển khai endpoint kiểm tra quota; không báo số neurons còn lại khi chưa có dữ liệu chính xác.
Xem [ghi chú phát hành](store/RELEASE-1.3.1.md).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `webmcp-extension/` | Extension React/TypeScript, agent runtime và kiểm thử |
| `cloudflare/` | Worker xác thực, danh sách model được phép và proxy inference |
| `demo/` | Trang WebMCP với dữ liệu giả |
| `store/` | Nội dung Store, ảnh, chính sách riêng tư và ghi chú phát hành |

## Build extension

Cần Node >=22.18 và Chrome >=155 có WebMCP native.

```powershell
cd webmcp-extension
npm ci --ignore-scripts
node scripts/buildStore.ts
```

Build tạo `webmcp-extension/store-dist`. Mở `chrome://extensions`, bật Developer mode,
chọn Load unpacked và chọn thư mục đó. Bật WebMCP testing nếu bản Chrome yêu cầu.

Đặt `WEBMCP_CLOUD_URL` khi build để trỏ tới Worker HTTPS của bạn. Nếu không đặt, script dùng
endpoint thử nghiệm trong source. Worker đó cần tài khoản trợ lý đã được cấp; source không chứa
mật khẩu hoặc token để đăng nhập.

## Worker

Tại thư mục gốc, chạy `node cloudflare/build-worker.mjs` để tạo Worker từ các phần source.
Cấu hình binding `AI` và rate limiter `EXTENSION_RATE_LIMITER` theo `cloudflare/wrangler.jsonc`.
Đặt các giá trị riêng qua Cloudflare Secrets:

- `EXTENSION_USERS_JSON`: ánh xạ tên tài khoản sang thuộc tính `hash`, dùng PBKDF2-SHA256,
  100000 vòng, salt và hash mã hóa base64url theo định dạng trong `cloudflare/extension-auth.js`.
- `EXTENSION_SESSION_SECRET`: khóa ngẫu nhiên tối thiểu 32 ký tự để ký phiên một giờ.
- `POC_TOKEN`: chỉ phục vụ các route POC cũ; extension cloud không dùng khóa này.

Không commit giá trị thật. `cloudflare/private/`, `.env`, `.dev.vars` và thư mục build đã được bỏ qua.
Các bài kiểm thử Worker dùng tài khoản giả và không cần secret production.

## Kiểm thử

```powershell
cd webmcp-extension
npm run typecheck
npm run test:unit
cd ..
node --test cloudflare/worker.test.mjs cloudflare/extension-auth.test.mjs
```

Ngày 25/11/2026: typecheck, **226 unit tests** và **14 Worker tests** đạt.
Các kiểm thử trình duyệt với Qwen/Granite thật đã chạy ngày 20/11/2026; ghi chú trong
`store/RELEASE-1.2.0.md` và `store/RELEASE-1.2.1.md`.
Các script kiểm thử live cần tài khoản thử nghiệm đặt cục bộ trong
`cloudflare/private/test-login.json`; file đó không được đưa lên repository.

Thống kê token chỉ gồm usage nhà cung cấp trả về trong vòng đời panel hiện tại, đặt lại khi
đóng/nạp lại panel hoặc đăng xuất. Đây không phải tổng lịch sử sử dụng hay hóa đơn Cloudflare.

## Nguồn gốc

Dựa trên [GoogleChromeLabs/webmcp-extension](https://github.com/GoogleChromeLabs/webmcp-extension),
commit `1d6a1c5da0096339d70dd6da4c98390746d7381b`. Giữ nguyên thông báo bản quyền upstream;
mã nguồn theo Apache-2.0, xem `LICENSE` và `webmcp-extension/LICENSE`.
Nguồn hình ảnh và quá trình chỉnh sửa được ghi trong `store/asset-source.json`.

Xem `HUONG-DAN.md` để cài thử và `store/` để theo dõi hồ sơ phát hành.

Kiểm tra bản 1.3.1 ngày 26/11/2026: typecheck, 232 unit tests, 21 Worker tests và kiểm thử giao diện ở bốn kích thước panel đạt.
Phản hồi model trong bài kiểm thử giao diện là dữ liệu mô phỏng; các model mới chưa được kiểm thử inference thành công vì hết quota.
