USE club_event_manager;

INSERT INTO events (title, event_time, location, description)
VALUES
('Workshop Git co ban', '2026-03-25 18:00:00', 'Phong A101', 'Huong dan Git va GitHub cho thanh vien moi'),
('Workshop HTML CSS JS', '2026-03-28 14:00:00', 'Phong B203', 'On tap nen tang frontend'),
('Workshop Node.js co ban', '2026-03-30 19:00:00', 'Phong C105', 'Lam quen backend bang Node.js');

INSERT INTO registrations (event_id, full_name, student_id, class_name, faculty, email, phone)
VALUES
(1, 'Nguyen Van A', 'SV001', 'K50', 'Cong nghe thong tin', 'sv001@example.com', '0900000001'),
(1, 'Tran Thi B', 'SV002', 'K49', 'Cong nghe thong tin', 'sv002@example.com', '0900000002'),
(2, 'Le Van C', 'SV003', 'K48', 'Quan tri kinh doanh', 'sv003@example.com', '0900000003');
