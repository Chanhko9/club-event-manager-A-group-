ALTER TABLE registrations
ADD UNIQUE KEY unique_event_email (event_id, email),
ADD UNIQUE KEY unique_event_student_id (event_id, student_id);