USE club_event_manager;

ALTER TABLE registrations
    ADD COLUMN class_name VARCHAR(100) NULL AFTER student_id,
    ADD COLUMN faculty VARCHAR(150) NULL AFTER class_name;
