// utils/billdesk-crypto.js
const crypto = require("crypto");

// base64url helper (compatible with node LTS)
const base64url = (buf) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * buildJwsHmac(headerObj, payloadObj, clientKey)
 * - returns a string header.payload.signature (base64url)
 * - BillDesk expects this in Authorization header: "JWS <token>"
 * - header should include alg, clientid, and kid (if provided in key file)
 */
function buildJwsHmac(headerObj, payloadObj, clientKey) {
  if (!clientKey) {
    throw new Error("Missing BD_CLIENT_KEY (Signing Password) for JWS generation");
  }

  // merge defaults into header
  const hdr = {
    alg: "HS256",
    ...headerObj,
  };

  const headerB64 = base64url(Buffer.from(JSON.stringify(hdr)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payloadObj)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // HMAC-SHA256 using Signing Password
  const signature = crypto.createHmac("sha256", String(clientKey))
    .update(signingInput)
    .digest();

  const signatureB64 = base64url(signature);
  return `${signingInput}.${signatureB64}`;
}

/**
 * AES-256-CBC encrypt to hex
 * - key must be 32 bytes, iv 16 bytes (use environment values)
 * - BillDesk may expect base64 instead of hex → change "hex" to "base64" if docs require
 */
function aes256EncryptToHex(plainText, key, iv) {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function aes256DecryptFromHex(hexCipher, key, iv) {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let decrypted = decipher.update(hexCipher, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = {
  buildJwsHmac,
  aes256EncryptToHex,
  aes256DecryptFromHex,
};
