# UX Review — báo cáo từ user-persona subagent (2026-06-11)

Phương pháp: 1 subagent đóng vai dev VN lần đầu dùng app, thao tác thật qua Playwright trên
http://localhost:5174 (duyệt/tìm/lọc phiên, xem cây, toggle tin kế thừa, đặt tên, export,
1 lần fork thử, resize/ESC/reload). Không xóa gì, không chat thêm.

## Bug tìm được (theo mức nghiêm trọng)

1. **Đặt tên trống làm mất tên custom cũ, không undo** — ✎ Đặt tên → để trống → OK: tên rơi
   về aiTitle auto, tên custom cũ mất vĩnh viễn. (Mất dữ liệu user = nặng nhất.)
2. **Markdown hiển thị raw** trong panel hội thoại (`**bold**`, code block, list đều thô) —
   đọc câu trả lời dài gần như không nổi.
3. **Số "lượt" trên node không khớp** số tin nhắn panel hiển thị (node "3 lượt", panel 2 tin)
   — turns đếm cả tool-plumbing, panel thì đã lọc.
4. **F5 mất toàn bộ selection**, URL luôn `/` → không bookmark/share được phiên đang xem.
5. **Node fork mới bị panel che** — cây không fit lại vùng trống còn lại; fork xong suýt
   tưởng thất bại.
6. ESC không đóng panel/modal. favicon 404. Kéo node bị khóa. Right-click không có menu.
7. Tổng phiên tự nhảy 78→80 khi đang dùng (fork + phiên nền) mà không có thông báo.

## Thiếu cho dùng hằng ngày (xếp theo cần)

1. Full-text search trong NỘI DUNG hội thoại (hiện chỉ tìm tiêu đề — nhu cầu số 1 với 80 phiên)
2. Render markdown trong panel
3. Fork từ tin nhắn bất kỳ giữa hội thoại (backend forkAt đã có, UI chưa expose — tính năng
   khác biệt nhất đang bị bỏ phí)
4. URL routing / deep-link phiên
5. Tên nhánh fork tự lấy theo prompt đầu (hiện 4 node con trùng tên "Create new Claude chat session")
6. Streaming hiển thị rõ + spinner khi chờ
7. Ẩn/gộp phiên rác tiêu đề ".", phân biệt phiên trùng tên
8. Copy 1 tin nhắn, timestamp, token/model của phiên
9. Phím tắt: ESC đóng, ↑↓ duyệt list
10. Export: tên file theo tên phiên + Content-Disposition tải về + format JSON

## Thiếu để public cho cộng đồng

- Config hóa: đường dẫn `~/.claude/projects` + port đang hard-code → env/config file
- An toàn: CORS đang `*` trong khi API đọc TOÀN BỘ lịch sử chat + có endpoint xóa/ghi;
  cần bind localhost rõ ràng, cân nhắc token, confirm trước Xóa
- Cài đặt 1 lệnh (npx hoặc Docker) + check `claude` CLI tồn tại với lỗi tử tế
- README đang thiên kiến trúc nội bộ → viết lại theo end-user, thêm screenshot,
  troubleshooting, giải thích "fork an toàn với file gốc thế nào"
- i18n (EN tối thiểu) — UI đang cứng tiếng Việt
- favicon, error boundary khi backend chết, test, LICENSE, CI

## Khen / chê thẳng (nguyên văn tinh thần)

- Khen: ý tưởng đúng nhu cầu thật; fork giữ phiên gốc nguyên vẹn đúng cam kết; nút
  "tin nhắn kế thừa từ phiên cha" là chi tiết UX thông minh nhất; export đủ context;
  UI chỉn chu hơn mặt bằng tool cá nhân.
- Chê: hiện mới "demo được" chứ chưa "dùng hằng ngày được" — markdown raw, không tìm theo
  nội dung, mất state khi reload, bug rename mất tên phải sửa trước khi đưa cho người khác.
