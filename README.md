# Club Event Manager

Hệ thống quản lý sự kiện dành cho câu lạc bộ/trường học, hỗ trợ đăng ký sự kiện công khai cho người dùng và khu vực quản trị riêng cho admin.

## Giới thiệu

**Club Event Manager** là website hỗ trợ tổ chức và quản lý sự kiện một cách thuận tiện hơn.

Người dùng thông thường **không cần đăng nhập** vẫn có thể:
- xem sự kiện
- đăng ký tham gia
- gửi feedback sau sự kiện

Admin sau khi đăng nhập có thể:
- tạo, sửa, xóa sự kiện
- xem danh sách đăng ký
- gửi lại email xác nhận
- check-in thủ công
- check-in bằng QR
- theo dõi thống kê và báo cáo sự kiện
- quản lý feedback sau sự kiện

---

## Tính năng chính

### Người dùng
- Truy cập trang chủ
- Xem danh sách sự kiện
- Đăng ký tham gia sự kiện mà không cần đăng nhập
- Nhận email xác nhận đăng ký
- Gửi phản hồi sau sự kiện

### Admin
- Đăng nhập bằng tài khoản quản trị
- Quản lý sự kiện
- Xem danh sách người đăng ký theo từng sự kiện
- Tìm kiếm người đăng ký theo MSSV, email hoặc mã đăng ký
- Check-in thủ công
- Check-in bằng QR Code
- Gửi lại email xác nhận
- Xem thống kê tổng số đăng ký, số lượng check-in
- Xem báo cáo theo lớp/khoa hoặc nhóm dữ liệu đăng ký
- Quản lý form feedback và gửi link feedback cho người tham gia

---

## Công nghệ sử dụng

### Frontend
- HTML
- CSS
- JavaScript

### Backend
- Node.js
- Express.js

### Database
- MySQL

### Thư viện nổi bật
- `mysql2`
- `dotenv`
- `cors`
- `exceljs`

---

## Cấu trúc thư mục

```bash
club-event-manager/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── services/
│   │   └── app.js
│   ├── tests/
│   ├── .env
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── css/
│   ├── js/
│   ├── index.html
│   ├── LoginAdmin.html
│   ├── TaoSuKien.html
│   ├── DanhSachDangKy.html
│   ├── FormDangKy.html
│   └── FeedbackSuKien.html
│
├── database/
│   └── club_event_manager.sql
│
└── README.md
