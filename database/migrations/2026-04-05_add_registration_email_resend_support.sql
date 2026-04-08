USE club_event_manager;

ALTER TABLE registrations
    ADD COLUMN qr_code VARCHAR(50) NULL AFTER phone,
    ADD COLUMN qr_payload LONGTEXT NULL AFTER qr_code,
    ADD COLUMN qr_created_at DATETIME NULL AFTER qr_payload,
    ADD COLUMN email_delivery_status VARCHAR(30) NOT NULL DEFAULT 'Chờ gửi' AFTER qr_created_at,
    ADD COLUMN email_sent_at DATETIME NULL AFTER email_delivery_status,
    ADD COLUMN email_error_message TEXT NULL AFTER email_sent_at;

CREATE TABLE IF NOT EXISTS registration_email_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registration_id INT NOT NULL,
    event_id INT NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    send_type VARCHAR(20) NOT NULL DEFAULT 'initial',
    delivery_status VARCHAR(30) NOT NULL,
    message_id VARCHAR(255) NULL,
    error_message TEXT NULL,
    qr_payload LONGTEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_registration_email_logs_registration
        FOREIGN KEY (registration_id) REFERENCES registrations(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_registration_email_logs_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE
);
