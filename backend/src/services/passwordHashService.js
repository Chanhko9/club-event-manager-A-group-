const crypto = require('node:crypto');

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createScryptOptions() {
  return {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 32 * 1024 * 1024
  };
}

function hashPassword(password, options = {}) {
  const normalizedPassword = normalizeText(password);
  if (!normalizedPassword) {
    throw new Error('Password is required to generate hash.');
  }

  const saltHex = normalizeText(options.saltHex) || crypto.randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = crypto.scryptSync(normalizedPassword, Buffer.from(saltHex, 'hex'), KEY_LENGTH, createScryptOptions());

  return [
    SCRYPT_PREFIX,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    saltHex,
    derivedKey.toString('hex')
  ].join('$');
}

function safeCompare(left, right) {
  const leftValue = Buffer.from(String(left));
  const rightValue = Buffer.from(String(right));

  if (leftValue.length !== rightValue.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftValue, rightValue);
}

function verifyPassword(password, storedHash) {
  const normalizedHash = normalizeText(storedHash);
  if (!normalizedHash) {
    return false;
  }

  const parts = normalizedHash.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }

  const [, costRaw, blockSizeRaw, parallelizationRaw, saltHex, expectedHash] = parts;
  const cost = Number.parseInt(costRaw, 10);
  const blockSize = Number.parseInt(blockSizeRaw, 10);
  const parallelization = Number.parseInt(parallelizationRaw, 10);

  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization) || !saltHex || !expectedHash) {
    return false;
  }

  const derivedKey = crypto.scryptSync(
    normalizeText(password),
    Buffer.from(saltHex, 'hex'),
    expectedHash.length / 2,
    {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 32 * 1024 * 1024
    }
  );

  return safeCompare(derivedKey.toString('hex'), expectedHash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
