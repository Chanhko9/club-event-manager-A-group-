USE club_event_manager;

ALTER TABLE registrations
    ADD COLUMN checked_in_at DATETIME NULL AFTER phone;
