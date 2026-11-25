# BIZ Mbee Assistant 1.2.1

## Bản có đăng nhập, dùng backend Cloudflare

File cài thử mới nhất: `artifacts/BIZ-Mbee-Assistant-1.2.1.zip`. Bản này không cần chạy Node/server local.
Thư mục bản build trên máy: `webmcp-extension/store-dist` với phiên bản 1.2.1.

Mở **Token đã ghi nhận** dưới bộ chọn model để xem token vào/ra/tổng và từng model.
Số liệu lấy từ usage Cloudflare, cộng mọi lượt gọi model trong panel, bao gồm các lượt tool.
Đổi model hoặc tạo chat mới không xóa thống kê; đóng/nạp lại panel hoặc đăng xuất sẽ đặt lại.
Không truy ngược được các lượt dùng trước bản này; đây không phải tổng hóa đơn tài khoản Cloudflare.

Sau khi đăng nhập, chọn **Model AI** phía trên khung chat: Qwen 3.8 27B (mặc định) hoặc
Granite 4.0 H Micro (3B). Đổi model sẽ bắt đầu hội thoại mới trên các tab của panel;
không đổi được khi đang chạy tác vụ hoặc chờ xác nhận. Lựa chọn được nhớ khi mở lại.

Ngày 25/11/2026 đã xác nhận bản 1.1.0 được Google duyệt và **đã xuất bản công khai**.
Bản 1.2.1 có chọn model và thống kê token đã được tải lên và gửi duyệt cập nhật ngày 25/11/2026;
Google xác nhận **Đang chờ xem xét**, với tự động xuất bản khi được duyệt.
Bản public hiện tại: https://chromewebstore.google.com/detail/biz-mbee-assistant/opifljgebjckcihkflechmdolimljfln.
Mã extension: `opifljgebjckcihkflechmdolimljfln`. Trạng thái: `store/PUBLICATION-STATUS.json`.

1. Giải nén ZIP, mở `chrome://extensions`, bật Developer mode và Load unpacked thư mục chứa `manifest.json`.
2. Mở side panel BIZ Mbee Assistant và đăng nhập bằng tài khoản trợ lý `admin` đã cấu hình trên Worker.
3. Mở https://biz.thanhtunga2cvp.workers.dev/demo, bật WebMCP testing nếu bản Chrome yêu cầu.
4. Đồng ý màn hình giải thích dữ liệu, sau đó chat với trợ lý. Thao tác ghi vẫn cần kiểm tra quyền.

Phiên tự hết hạn sau một giờ. Đăng xuất xóa phiên và các hội thoại trên trình duyệt.
Mật khẩu được băm có salt trong Cloudflare Secrets; không nằm trong ZIP. Tài khoản trợ lý tách khỏi tài khoản ngân hàng.

Chính sách riêng tư: https://biz.thanhtunga2cvp.workers.dev/privacy.
Hồ sơ Store: `store/listing.json`. Ảnh ong: `store/mbee-avatar.png`; nguồn và prompt imagegen: `store/asset-source.json`.
Đã đạt 6 bài browser acceptance với endpoint xác thực và model thật đã deploy; bằng chứng trong `artifacts/auth-live-acceptance`.

## Bản POC local trước đây

Các mục dưới đây dành cho ZIP POC cũ `webmcp-extension.zip`, không phải ZIP public 1.1.0.

## Trên máy hiện tại

Server AI đang dùng Qwen/Cloudflare đã cấu hình trong `webmcp-extension/.env`.
Token provider chỉ nằm ở server local. Trang demo: http://127.0.0.1:8088.

1. Mở `chrome://extensions`, bật Developer mode, chọn Load unpacked.
2. Chọn thư mục `webmcp-extension/dist` trong dự án này (hoặc giải nén gói extension ZIP rồi chọn thư mục chứa manifest.json).
3. Bật WebMCP testing nếu Chrome chưa có API native. Mở trang demo localhost.
4. Mở WebMCP Extension, chọn Got it; giữ backend server và cảnh báo Sensitive action alerts.
5. Chat: `Điền mã đơn vị DEMOCORP và tên người dùng DEMOUSER23`. Chọn Allow để thử callback native.

Nếu server/demo đã tắt, mở hai cửa sổ PowerShell tại thư mục dự án:

```powershell
.\poc.ps1 Server
```

```powershell
.\poc.ps1 Demo
```

`poc.ps1` dùng Node 24 có sẵn trên máy; Node mặc định v20 không chạy được upstream này.

## Mang sang máy khác

Gói bàn giao đầy đủ chứa source đã vá, bản dist, demo, Worker, patch và bằng chứng kiểm thử.
Không chứa `.env`, token provider hay `node_modules`.

1. Cần Node >=22.18 và Chrome >=155.
2. Chạy `.\poc.ps1 Install` để cài dependency theo lockfile, không chạy lifecycle scripts.
3. Tạo `webmcp-extension/.env` theo `cloudflare/poc.env.example`; điền token provider tại máy đích.
4. Chạy `.\poc.ps1 Build` để tạo token local mới và build extension tương ứng.
5. Chạy Server, Demo và nạp dist theo các bước ở trên.

## Đã kiểm tra

- Typecheck đạt; 221 unit test, 23 smoke test, 5 test Worker đạt.
- Qwen thật đã hiểu tiếng Việt, gọi tool native, hỏi dữ liệu thiếu, giữ hội thoại nhiều lượt.
- Đã thử cho phép/từ chối quyền, công bố tool mới, gỡ tool và tách tab.
- Chi tiết: `ACCEPTANCE.md`, `provider-verification.json`, `artifacts/acceptance/`.
- Chưa thử model khác hoặc môi trường BIZ nội bộ.

Worker giữ API `{message}` cũ, thêm `/v1/chat/completions`. Source gốc và source mới ở `cloudflare/`.
Token liên lạc local có trong bundle theo thiết kế upstream; tạo lại token/build khi chuyển sang máy khác.
