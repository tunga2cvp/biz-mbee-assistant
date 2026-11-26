# BIZ Mbee Assistant 1.3.1

- Việt hóa giao diện bản cloud: hướng dẫn ban đầu, cài đặt, trạng thái xử lý,
  hộp xin phép, xác nhận tác vụ, danh sách công cụ và nhãn hỗ trợ tiếp cận.
- Giữ màn hình chat gọn; chọn mô hình và thống kê vẫn nằm trong Cài đặt.
- Khi trang công bố tool WebMCP, hiển thị tối đa ba gợi ý, ưu tiên nhóm công việc khác nhau.
  Gợi ý chỉ điền yêu cầu vào ô chat, không gửi hoặc thực thi công cụ ngay; không tự tạo tham số.
- Giữ nguyên tên và mô tả công cụ do website cung cấp. Nhãn gợi ý của extension dùng tiếng Việt.

Kiểm tra ngày 26/11/2026: typecheck, 232 unit tests và kiểm thử trình duyệt
với tool native của trang demo đạt. Đã xác nhận gợi ý biến mất trên trang không có tool;
chọn gợi ý không gọi AI hoặc thực thi tool. Kiểm tra giao diện ở bốn kích thước panel đạt.
Các phản hồi chat trong kiểm thử giao diện dùng dữ liệu mô phỏng, không phải đánh giá chất lượng model.

Gói cài: `artifacts/BIZ-Mbee-Assistant-1.3.1.zip`.
Thư mục load unpacked: `webmcp-extension/store-dist`.
Chưa gửi bản 1.3.1 lên Chrome Web Store. Thay đổi này không cần triển khai lại Worker;
endpoint quota và bốn model đã triển khai ở Worker `c3c47479`.
