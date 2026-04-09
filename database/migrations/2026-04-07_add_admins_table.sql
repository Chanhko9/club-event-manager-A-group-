USE club_event_manager;

CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_admins_username UNIQUE (username),
    CONSTRAINT uq_admins_email UNIQUE (email)
);

INSERT INTO admins (username, email, full_name, password_hash, role, is_active)
SELECT
    'admin',
    'admin@example.com',
    'Super Admin',
    'scrypt$16384$8$1$00112233445566778899aabbccddeeff$fc2c27027ca03bc969d6e5464ce846f7761540f9fc648764dd5f2a389086cbb2a7ec29fc52f84e2c503af2243c9e2449f3d1919418e64955501ea033fab87bc1',
    'super_admin',
    1
WHERE NOT EXISTS (
    SELECT 1 FROM admins WHERE username = 'admin' OR email = 'admin@example.com'
);
