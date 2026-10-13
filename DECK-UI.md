# Orca Deck — bản giao diện riêng

Mở **Orca Deck** trong menu ứng dụng, hoặc chạy:

```sh
~/.local/bin/orca-deck
```

Mã nguồn: `/home/towfienes/Projects/orca-deck`, nhánh `deck-ui`.
Cấu hình riêng: `/home/towfienes/.config/orca-deck`.
UI Deck đã được tích hợp và cài vào **Orca chính 1.4.220**. Menu Orca mở `~/Applications/Orca-1.4.220-Deck-Header/AppRun`, dùng profile Orca hiện có. Thoát rồi mở lại Orca để nạp renderer mới.

## Giao diện

- Sidebar nhóm theo project, nhánh và agent; khoảng hở giữa các hàng 2 px và đệm workspace 2 px để project/nhánh sát nhau. Mỗi agent hai dòng với biểu tượng và trạng thái.
- Worktree / Folder / Agent ở trên, tự xuống hàng khi sidebar hẹp để giữ đủ chữ; Search, Tasks và Automations trong nút Tools and search bên dưới.
- **+ Agent** chia ô terminal vừa rê chuột qua trong workspace hiện tại. Nếu chưa rê qua ô nào, dùng ô đang chọn; ô rộng chia trái/phải, ô cao chia trên/dưới. Thêm agent tiếp tục chia ô đích, không tạo thêm tab. Khi không có terminal hiện trên màn hình, giữ luồng tạo tab agent mới.
- Tab có nhiều pane hiển thị “Workspace · N panes”, giữ nguyên tên tự đặt. Breadcrumb project/nhánh nằm cùng hàng tab và tự ẩn khi thanh tab hẹp.
- Sidebar, thanh tab và vùng giữa các pane dùng một nền liền mạch. Pane cách mép 6 px, bo nhẹ, có viền mảnh; pane đang chọn có viền sáng hơn. Header pane cao 32 px, nền header của pane đang chọn khớp terminal.
- Hàng agent đang chọn nền sáng ngay cả trước khi có trạng thái; hỗ trợ Enter/Space để chuyển pane.
- Nền liền mạch, bỏ đường chia sidebar/header/thanh dưới; chỉ pane giữ viền mảnh. Logo agent đứng yên, vòng trạng thái nhỏ vẫn báo đang làm việc.
- Workspace TDTU đã được mở với bốn terminal theo bố cục 2×2, lưu qua lần khởi động tiếp theo.
- Gợi ý setup script nằm trong menu công cụ; các thao tác workspace và terminal dùng lại cơ chế Orca.

Thanh tab được tinh chỉnh theo video Deck: tab thấp, bo nhẹ, nền thường/hover/active phân cấp rõ, dấu chọn gọn và nút đóng có vùng bấm rộng hơn. Khi nhiều tab, tên giữ chiều rộng tối thiểu và tab đang chọn vẫn hiện ở mép khi cuộn. Hàng tóm tắt terminal cùng màu nền terminal và giới hạn chiều dài.

Định hướng hình ảnh và đối chiếu mã nguồn được lưu ở [SpaceVibe Deck UI reference](docs/readme/spacevibe-deck-ui.md). Đây là bản thích nghi theo kiến trúc Orca, chưa trùng từng pixel. Nội dung CLI do từng agent và cấu hình shell hiển thị. Các agent trong ảnh kiểm thử là dữ liệu minh họa; bản sử dụng mở terminal thật và không tự chạy tác vụ AI.

Profile riêng không sao chép tài khoản hay phiên chat đang chạy. Sign-in hiện chưa được cấu hình trong bản chạy từ mã nguồn này; bản đóng gói Orca có cấu hình mặc định riêng. Không cần đăng nhập Deck để phát triển UI và đưa thay đổi về Orca gốc. Bản tùy chỉnh chưa được đóng gói thành AppImage; cần giữ thư mục mã nguồn và node_modules. Cập nhật ứng dụng Orca gốc không cập nhật bản tùy chỉnh này.

Trên Linux, bỏ các nút thu nhỏ/phóng to/đóng trong app; cụm chống ngủ, RAM, số terminal và cổng chuyển lên góc trên phải. Bấm vẫn mở menu và bảng chi tiết cũ. Windows giữ nút cửa sổ; macOS giữ traffic lights.

## Kiểm tra

- Typecheck renderer: `pnpm tc:web`.
- Chất lượng phần mã thay đổi: `pnpm run check:code-quality:changed`.
- Lượt kiểm tra tinh chỉnh pane/tab: 41 bài trong 7 tệp, gồm chọn agent trước khi có trạng thái, breadcrumb cho folder/SSH và các hành vi hiện có.
- Electron E2E: tạo bốn pane, chọn agent bằng chuột/bàn phím, kiểm tra không chồng hàng sidebar, mở menu công cụ và resize từ 1600×900 xuống 1050×700; kiểm tra viền pane, màu header, căn giữa biểu tượng trạng thái và breadcrumb tự ẩn.
- Kiểm tra mở lại profile và khôi phục bốn terminal.
- Tab: sáng/tối, hover trên tab đang chọn, overflow ở 900 px, đổi tên, đóng bằng bàn phím, kéo thả, ghim và reduced motion. Tab terminal/file/browser đồng nhất chiều cao; dấu file chưa lưu giữ nguyên độ rộng và nút đóng dùng được bằng bàn phím.
- Agent tiling: kiểm thử Electron thêm ba agent giả lập vào cùng tab, từ một lên bốn pane; ô dưới chuột được ưu tiên hơn ô đang giữ focus bàn phím. Kiểm thử đơn vị xác nhận định tuyến host, giữ revision của kết nối và không chuyển sang ô khác khi ô đích đã đóng.

Chạy kiểm thử tự động với `ORCA_BACKGROUND_LAUNCH=1`; lượt tinh chỉnh tab dùng Electron headless trên Linux và ảnh CDP. Không chạy toàn bộ test suite hay tác vụ với dịch vụ AI trả phí. Typecheck toàn bộ E2E hiện có lỗi ở các file khác; typecheck renderer và gate chất lượng phần thay đổi đã qua.

## Dựng lại

```sh
cd /home/towfienes/Projects/orca-deck
pnpm exec electron-vite build
```

Ảnh kiểm thử mới: [workspace và pane](docs/assets/orca-deck-workspace.png), [thanh tab](docs/assets/orca-deck-tabs.png).

## Tích hợp vào Orca gốc

Đã tích hợp trên nhánh `deck-integration/1.4.220` và cài vào menu Orca chính. Gói cài dùng runtime/main/preload gốc và renderer Deck; cấu hình giao diện được nhập một lần cho từng profile, giữ các chỉnh sửa sau đó. Tài khoản, dự án và phiên terminal không được sao chép từ Deck. Xem [trạng thái tích hợp và cách hoàn tác](docs/readme/orca-1.4.220-integration.md).
