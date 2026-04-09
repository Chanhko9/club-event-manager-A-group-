const crypto = require('node:crypto');

const pool = require('../config/db');
const { verifyPassword, hashPassword } = require('./passwordHashService');

const ADMIN_SESSION_COOKIE_NAME = 'admin_session';
const DEFAULT_SESSION_SECRET = 'dev-secret-change-me';
const DEFAULT_SESSION_TTL_HOURS = 8;
const DEFAULT_BOOTSTRAP_USERNAME = 'admin';
const DEFAULT_BOOTSTRAP_EMAIL = 'admin@example.com';
const DEFAULT_BOOTSTRAP_PASSWORD = 'admin123456';
const DEFAULT_BOOTSTRAP_FULL_NAME = 'Super Admin';
const DEFAULT_BOOTSTRAP_ROLE = 'super_admin';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function getAdminSessionConfig() {
  const ttlHours = Number.parseInt(process.env.ADMIN_SESSION_TTL_HOURS || String(DEFAULT_SESSION_TTL_HOURS), 10);

  return {
    sessionSecret: normalizeText(process.env.ADMIN_SESSION_SECRET) || DEFAULT_SESSION_SECRET,
    sessionTtlHours: Number.isInteger(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_SESSION_TTL_HOURS
  };
}

function getAdminBootstrapConfig() {
  return {
    username: normalizeText(process.env.ADMIN_BOOTSTRAP_USERNAME) || DEFAULT_BOOTSTRAP_USERNAME,
    email: normalizeEmail(process.env.ADMIN_BOOTSTRAP_EMAIL) || DEFAULT_BOOTSTRAP_EMAIL,
    password: normalizeText(process.env.ADMIN_BOOTSTRAP_PASSWORD) || DEFAULT_BOOTSTRAP_PASSWORD,
    fullName: normalizeText(process.env.ADMIN_BOOTSTRAP_FULL_NAME) || DEFAULT_BOOTSTRAP_FULL_NAME,
    role: normalizeText(process.env.ADMIN_BOOTSTRAP_ROLE) || DEFAULT_BOOTSTRAP_ROLE
  };
}

function safeCompare(left, right) {
  const leftValue = Buffer.from(String(left));
  const rightValue = Buffer.from(String(right));

  if (leftValue.length !== rightValue.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftValue, rightValue);
}

function signSessionPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function mapAdminRow(admin) {
  if (!admin) {
    return null;
  }

  return {
    id: Number(admin.id),
    username: normalizeText(admin.username),
    email: normalizeEmail(admin.email),
    full_name: normalizeText(admin.full_name),
    role: normalizeText(admin.role) || 'admin'
  };
}

async function findActiveAdminByIdentifier(identifier) {
  const normalizedIdentifier = normalizeText(identifier);
  const normalizedEmailIdentifier = normalizeEmail(identifier);

  if (!normalizedIdentifier && !normalizedEmailIdentifier) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT id, username, email, full_name, role, password_hash, is_active, created_at, updated_at
      FROM admins
      WHERE is_active = 1
        AND (
          LOWER(username) = LOWER(?)
          OR LOWER(email) = LOWER(?)
        )
      ORDER BY id ASC
      LIMIT 1
    `,
    [normalizedIdentifier, normalizedEmailIdentifier]
  );

  return rows[0] || null;
}

async function findActiveAdminById(adminId) {
  const normalizedAdminId = Number.parseInt(adminId, 10);
  if (!Number.isInteger(normalizedAdminId) || normalizedAdminId <= 0) {
    return null;
  }

  const [rows] = await pool.query(
    `
      SELECT id, username, email, full_name, role, is_active, created_at, updated_at
      FROM admins
      WHERE id = ? AND is_active = 1
      LIMIT 1
    `,
    [normalizedAdminId]
  );

  return rows[0] || null;
}

async function authenticateAdmin({ identifier, password }) {
  const admin = await findActiveAdminByIdentifier(identifier);
  if (!admin) {
    return null;
  }

  const isMatchedPassword = verifyPassword(password, admin.password_hash);
  if (!isMatchedPassword) {
    return null;
  }

  return mapAdminRow(admin);
}

function createAdminSessionToken(admin) {
  const adminInfo = mapAdminRow(admin);
  if (!adminInfo?.id) {
    throw new Error('Admin session requires a valid admin record.');
  }

  const { sessionSecret, sessionTtlHours } = getAdminSessionConfig();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + sessionTtlHours * 60 * 60 * 1000;
  const basePayload = `${adminInfo.id}.${issuedAt}.${expiresAt}`;
  const signature = signSessionPayload(basePayload, sessionSecret);

  return `${basePayload}.${signature}`;
}

async function verifyAdminSessionToken(token) {
  const { sessionSecret } = getAdminSessionConfig();
  const normalizedToken = normalizeText(token);

  if (!normalizedToken) {
    return { isValid: false, reason: 'missing_token' };
  }

  const parts = normalizedToken.split('.');
  if (parts.length !== 4) {
    return { isValid: false, reason: 'malformed_token' };
  }

  const [adminIdRaw, issuedAtRaw, expiresAtRaw, signature] = parts;
  const adminId = Number.parseInt(adminIdRaw, 10);
  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  const expiresAt = Number.parseInt(expiresAtRaw, 10);

  if (!Number.isInteger(adminId) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !signature) {
    return { isValid: false, reason: 'invalid_payload' };
  }

  const expectedSignature = signSessionPayload(`${adminId}.${issuedAt}.${expiresAt}`, sessionSecret);
  if (!safeCompare(signature, expectedSignature)) {
    return { isValid: false, reason: 'invalid_signature' };
  }

  if (Date.now() > expiresAt) {
    return { isValid: false, reason: 'expired_token' };
  }

  const admin = await findActiveAdminById(adminId);
  if (!admin) {
    return { isValid: false, reason: 'admin_not_found' };
  }

  return {
    isValid: true,
    session: {
      ...mapAdminRow(admin),
      issuedAt,
      expiresAt
    }
  };
}

function parseCookieHeader(cookieHeader) {
  const cookieEntries = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  return cookieEntries.reduce((cookies, entry) => {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }

    return cookies;
  }, {});
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  if (cookies[ADMIN_SESSION_COOKIE_NAME]) {
    return cookies[ADMIN_SESSION_COOKIE_NAME];
  }

  const authorizationHeader = normalizeText(req?.headers?.authorization);
  if (authorizationHeader.toLowerCase().startsWith('bearer ')) {
    return authorizationHeader.slice(7).trim();
  }

  return '';
}

async function ensureAdminAuthInfrastructure() {
  await pool.query(`
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
    )
  `);

  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM admins');
  const adminCount = Number(rows?.[0]?.total || 0);

  if (adminCount > 0) {
    return;
  }

  const bootstrapAdmin = getAdminBootstrapConfig();
  const passwordHash = hashPassword(bootstrapAdmin.password);

  await pool.query(
    `
      INSERT INTO admins (username, email, full_name, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `,
    [
      bootstrapAdmin.username,
      bootstrapAdmin.email,
      bootstrapAdmin.fullName,
      passwordHash,
      bootstrapAdmin.role
    ]
  );
}

module.exports = {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminSessionConfig,
  getAdminBootstrapConfig,
  createAdminSessionToken,
  verifyAdminSessionToken,
  authenticateAdmin,
  getSessionTokenFromRequest,
  parseCookieHeader,
  ensureAdminAuthInfrastructure,
  mapAdminRow,
  findActiveAdminById
};
