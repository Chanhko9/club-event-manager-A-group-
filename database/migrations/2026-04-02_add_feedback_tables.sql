CREATE TABLE IF NOT EXISTS feedback_forms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL UNIQUE,
    satisfaction_question VARCHAR(255) NOT NULL DEFAULT 'Mức độ hài lòng của bạn về sự kiện là gì?',
    comment_question TEXT NOT NULL,
    success_message TEXT NOT NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_forms_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    feedback_form_id INT NOT NULL,
    event_id INT NOT NULL,
    registration_id INT NOT NULL,
    satisfaction_rating TINYINT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_responses_form
        FOREIGN KEY (feedback_form_id) REFERENCES feedback_forms(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_feedback_responses_event
        FOREIGN KEY (event_id) REFERENCES events(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_feedback_responses_registration
        FOREIGN KEY (registration_id) REFERENCES registrations(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_feedback_response UNIQUE (event_id, registration_id)
);
