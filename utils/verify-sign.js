// verify-sign.js
// Usage:
//   node verify-sign.js "<signingInput>" "<expectedSignatureB64url>" "<keyCandidate>"
// Example:
//   node verify-sign.js "headerB64.payloadB64" "PzHt18Sa4gaIqfkH..." "my-secret-or-base64-or-hex"
//
// The script will try treating keyCandidate as:
//   1) base64 -> decoded bytes
//   2) hex -> decoded bytes
//   3) raw UTF-8 bytes
//
// It prints base64url(signature) for each attempt and indicates whether it matches expectedSignature.

const crypto = require('crypto');

function base64urlFromBuffer(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function looksLikeBase64(s) {
  return typeof s === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}
function looksLikeHex(s) {
  return typeof s === 'string' && /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;
}

function computeHmacSha256(keyBuf, signingInput) {
  const hmac = crypto.createHmac('sha256', keyBuf);
  hmac.update(signingInput);
  return hmac.digest();
}

function tryCandidateAs(candidate, signingInput, expectedB64) {
  const results = [];

  // 1) try as base64-decoded
  if (looksLikeBase64(candidate)) {
    try {
      const buf = Buffer.from(candidate, 'base64');
      const sig = computeHmacSha256(buf, signingInput);
      const b64u = base64urlFromBuffer(sig);
      results.push({ mode: 'base64-decoded', b64u, match: b64u === expectedB64 });
    } catch (e) {
      results.push({ mode: 'base64-decoded', error: e.message });
    }
  } else {
    results.push({ mode: 'base64-decoded', note: 'candidate does not look like base64' });
  }

  // 2) try as hex
  if (looksLikeHex(candidate)) {
    try {
      const buf = Buffer.from(candidate, 'hex');
      const sig = computeHmacSha256(buf, signingInput);
      const b64u = base64urlFromBuffer(sig);
      results.push({ mode: 'hex-decoded', b64u, match: b64u === expectedB64 });
    } catch (e) {
      results.push({ mode: 'hex-decoded', error: e.message });
    }
  } else {
    results.push({ mode: 'hex-decoded', note: 'candidate does not look like hex' });
  }

  // 3) try as raw utf8 string
  try {
    const buf = Buffer.from(String(candidate), 'utf8');
    const sig = computeHmacSha256(buf, signingInput);
    const b64u = base64urlFromBuffer(sig);
    results.push({ mode: 'utf8-raw', b64u, match: b64u === expectedB64 });
  } catch (e) {
    results.push({ mode: 'utf8-raw', error: e.message });
  }

  // 4) also try candidate treated as base64url (common for some keys)
  try {
    // convert base64url -> base64
    const maybe = String(candidate).replace(/-/g, '+').replace(/_/g, '/');
    // add padding
    const pad = '='.repeat((4 - (maybe.length % 4)) % 4);
    const str = maybe + pad;
    if (looksLikeBase64(str)) {
      const buf = Buffer.from(str, 'base64');
      const sig = computeHmacSha256(buf, signingInput);
      const b64u = base64urlFromBuffer(sig);
      results.push({ mode: 'base64url-decoded', b64u, match: b64u === expectedB64 });
    } else {
      results.push({ mode: 'base64url-decoded', note: 'not valid base64 after url->base64 transform' });
    }
  } catch (e) {
    results.push({ mode: 'base64url-decoded', error: e.message });
  }

  return results;
}

// ---- main ----
if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.length < 3) {
    console.error('Usage: node verify-sign.js "<signingInput>" "<expectedSignatureB64url>" "<keyCandidate>"');
    console.error('Example: node verify-sign.js "eyJ...abc.eyJ...def" "PzHt18Sa..." "AbCdEfGhBase64OrRaw"');
    process.exit(2);
  }

  const [signingInput, expectedB64, keyCandidate] = argv;
  console.log('Signing input (truncated):', signingInput.length > 240 ? signingInput.slice(0, 240) + '...' : signingInput);
  console.log('Expected signature (base64url):', expectedB64);
  console.log('Trying key candidate in multiple modes...');

  const results = tryCandidateAs(keyCandidate, signingInput, expectedB64);
  for (const r of results) {
    if (r.error) {
      console.log(`  [${r.mode}] error: ${r.error}`);
    } else if (r.note) {
      console.log(`  [${r.mode}] note: ${r.note}`);
    } else {
      console.log(`  [${r.mode}] computed: ${r.b64u}  match: ${r.match ? 'YES' : 'NO'}`);
    }
  }

  // Summary
  const anyMatch = results.some((r) => r.match);
  if (anyMatch) {
    console.log('\n✅ At least one candidate encoding produced a matching signature.');
  } else {
    console.log('\n⚠️ No match found. Try alternate key encodings (ask BillDesk whether your key is base64/hex/raw),');
    console.log('   or paste the signingInput + expectedSignature here and I can re-check patterns for you.');
  }
}
