# BIZ Mbee Assistant 1.2.2

Ngày 26/11/2026, Workers AI từ chối cả Qwen và Granite với lỗi binding `AiError 4006`:
đã hết hạn mức miễn phí 10.000 neurons trong ngày. Dashboard lúc kiểm tra vẫn hiển thị
5,6k/10k; số này không phù hợp với phản hồi trực tiếp từ dịch vụ inference.

## Thay đổi

- Worker trả HTTP 429 và mã `ai_quota_exceeded` cho lỗi hạn mức ngày, thay vì che thành 502.
- Trả `Retry-After` và `retryAt` tới 00:00 UTC kế tiếp (07:00 giờ Việt Nam).
- Extension phân biệt hết hạn mức ngày với giới hạn số yêu cầu trong một phút.
- Không tự thử lại, không tính lượt lỗi này thành token đã dùng, không đăng xuất người dùng.
- Các lỗi inference khác vẫn giữ phản hồi 502; không công khai nội dung lỗi upstream.

Worker đã triển khai: `b2e7ddef`. Kiểm tra production: đăng nhập 200, Qwen và Granite
đều 429 với đúng mã và thời điểm reset, phiên sau lỗi vẫn 200, CORS còn nguyên.
18 kiểm thử Worker, kiểm tra kiểu dữ liệu và kiểm thử luồng lỗi qua AI SDK đạt.

Bản cài 1.2.2 đã build tại `webmcp-extension/store-dist` và đóng ZIP.
Chưa tải lại extension đang cài do chính sách trình duyệt chặn thao tác tự mở trang quản lý tiện ích.
Bản này chưa gửi Chrome Web Store; trạng thái lần kiểm tra ngày 25/11 của bản 1.2.1 vẫn được lưu riêng.

Chủ tài khoản chọn chờ hạn mức miễn phí đặt lại lúc 07:00 ngày 27/11/2026 (Asia/Saigon).
Không nâng gói, không phát sinh đăng ký trả phí.

Tài liệu Cloudflare: https://developers.cloudflare.com/workers-ai/platform/pricing/
