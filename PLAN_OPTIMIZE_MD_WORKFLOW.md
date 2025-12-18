# Plan: Tối ưu workflow “ghi file Markdown” + export

## Mục tiêu

- Giảm thao tác khi soạn thảo/lưu Markdown và khi export PDF/DOCX.
- Giảm lỗi đường dẫn (output directory, `~`, khoảng trắng) và tăng khả năng debug khi Pandoc lỗi.

## Phạm vi dự kiến

- Tập trung vào workflow lưu file + export (không thay đổi UI lớn/không thêm server).
- Thay đổi chủ yếu trong `src/extension.ts` và `package.json` (nếu thêm command/setting).

## Kế hoạch triển khai

1. Chốt mục tiêu và workflow
2. Audit luồng save/export hiện tại
3. Thiết kế config và commands mới
4. Implement tối ưu lưu/đường dẫn
5. Thêm log `OutputChannel`, xử lý lỗi
6. Test trên Extension Host, chạy `lint/compile`

## Câu hỏi để chốt phạm vi

1. Bạn muốn tối ưu theo hướng nào?
   - (A) Auto-save/format trước khi export
   - (B) Export nhanh (không hiện Save dialog)
   - (C) Hỗ trợ template/frontmatter/snippets khi viết Markdown
   - (D) Khác (mô tả)
2. Output mặc định: luôn cạnh file `.md` hay theo `mdxExporter.outputDirectory`?
3. Có cần “export on save” (mỗi lần `Ctrl+S` tự export PDF/DOCX) không?

## Quyết định phạm vi (đã chốt)

- Chọn (A): format + auto-save trước khi export (mặc định bật).
- Output: vẫn dùng Save dialog, nhưng đường dẫn gợi ý lấy từ `mdxExporter.outputDirectory` (nếu có) hoặc cùng thư mục `.md`.
- Không làm “export on save”.

## Tiêu chí hoàn thành (gợi ý)

- Export hoạt động ổn định với:
  - `outputDirectory` chưa tồn tại (tự tạo thư mục).
  - đường dẫn có khoảng trắng.
  - đường dẫn `~/...` (nếu có hỗ trợ).
- Khi Pandoc lỗi: có log chi tiết trong `OutputChannel` và thông báo ngắn gọn cho người dùng.
