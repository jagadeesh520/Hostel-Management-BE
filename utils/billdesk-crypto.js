// utils/billdesk-crypto.js
// Implements JWE (dir, A256GCM) → JWS (HS256) compact flow for BillDesk.
// Requires: npm i jose axios
const crypto = require('crypto');

// --- env/config ---
const ENC_KEY_B64 = process.env.BILLDESK_ENC_KEY_B64 || '';
const ENC_KID = process.env.BD_KEY_ID || 'HMAC';
const SIGN_KEY_B64 = process.env.BILLDESK_SIGN_KEY_B64 || '';
const SIGN_KID = process.env.BILLDESK_SIGN_KID || 'HMAC';
const CLIENTID = process.env.BILLDESK_CLIENTID || '';
const TIMESTAMP_FORMAT = process.env.BILLDESK_TIMESTAMP_FORMAT || 'epoch';

// --- helper: decode base64 env key to Buffer ---
const bufFromB64 = (b64) => {
  if (!b64) throw new Error('Missing base64 key (check env vars)');
  return Buffer.from(b64, 'base64');
};

// --- base64url helpers ---
const base64url = (buf) =>
  Buffer.isBuffer(buf)
    ? buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    : Buffer.from(String(buf)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// --- Build timestamp ---
function buildTimestamp() {
  if (TIMESTAMP_FORMAT === 'YYYYMMDDHHmmss') {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  return Math.floor(Date.now() / 1000).toString();
}

function makeTraceId(hint) {
  const base = (hint ? String(hint).replace(/[^A-Za-z0-9]/g, '') : 'T') + Date.now();
  return base.slice(0, 35);
}

function buildHeaders(traceid) {
  return {
    'Content-Type': 'application/jose',
    'Accept': 'application/jose',
    'BD-Traceid': traceid,
    'BD-Timestamp': buildTimestamp()
  };
}

// --- JWE encrypt (dir + A256GCM) ---
async function encryptJsonToJweCompact(jsonPayload) {
  const jose = await import('jose');
  const encKey = bufFromB64(ENC_KEY_B64);
  if (encKey.length !== 32) throw new Error('Encryption key must be 32 bytes for A256GCM');

  const protectedHeader = {
    alg: 'dir',
    enc: 'A256GCM',
    kid: ENC_KID,
    clientid: CLIENTID
  };

  const plaintext = Buffer.from(JSON.stringify(jsonPayload), 'utf8');

  return await new jose.CompactEncrypt(plaintext)
    .setProtectedHeader(protectedHeader)
    .encrypt(encKey);
}

// --- JWS sign (HS256) ---
async function signJweCompactWithHs256(jweCompact) {
  const jose = await import('jose');
  const signKey = bufFromB64(SIGN_KEY_B64);
  if (signKey.length < 32) console.warn('[BD WARN] Signing key is shorter than 32 bytes');

  const protectedHeader = {
    alg: 'HS256',
    kid: SIGN_KID,
    clientid: CLIENTID
  };

  console.log('[BD DEBUG] JOSE signing header:', protectedHeader);

  return await new jose.CompactSign(Buffer.from(jweCompact, 'utf8'))
    .setProtectedHeader(protectedHeader)
    .sign(signKey);
}

// --- Build signed request body + headers ---
async function buildSignedRequest(jsonPayload, opts = {}) {
  if (!ENC_KEY_B64 || !SIGN_KEY_B64) {
    throw new Error('Missing BillDesk keys. Set BILLDESK_ENC_KEY_B64 and BILLDESK_SIGN_KEY_B64 in env');
  }

  const jwe = await encryptJsonToJweCompact(jsonPayload);
  const jws = await signJweCompactWithHs256(jwe);
  const traceid = makeTraceId(opts.traceIdHint || jsonPayload.orderid || 'T');
  const headers = buildHeaders(traceid);
  return { body: jws, headers, traceid };
}

// --- AES CBC helpers (deprecated) ---
function aes256EncryptToHex(plainText, keyUtf8, ivUtf8) {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyUtf8, 'utf8'), Buffer.from(ivUtf8, 'utf8'));
  return cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex');
}

function aes256DecryptFromHex(hexCipher, keyUtf8, ivUtf8) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyUtf8, 'utf8'), Buffer.from(ivUtf8, 'utf8'));
  return decipher.update(hexCipher, 'hex', 'utf8') + decipher.final('utf8');
}

module.exports = {
  encryptJsonToJweCompact,
  signJweCompactWithHs256,
  buildSignedRequest,
  buildHeaders,
  buildTimestamp,
  aes256EncryptToHex,
  aes256DecryptFromHex
};
