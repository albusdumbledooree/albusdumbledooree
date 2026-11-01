'use strict';
/*
 * Windows 7/8 that were not updated do not know the Let's Encrypt root (ISRG Root X1/X2), so the FLOWI site's
 * certificate looks "unknown" there (ERR_CERT_AUTHORITY_INVALID). This program carries those two roots and checks the
 * chain itself — the site's own name, the dates, and every signature up to one of the roots.
 * It is used only for the business's own address and only when Windows did not know the root;
 * anything else is decided by the usual check.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function loadRoots(dir = path.join(__dirname, 'certs')) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.pem')).map((f) => new crypto.X509Certificate(fs.readFileSync(path.join(dir, f))));
}

const inDate = (c, now) => now >= Date.parse(c.validFrom) && now <= Date.parse(c.validTo);
const signedBy = (c, issuer) => { try { return c.checkIssued(issuer) && c.verify(issuer.publicKey); } catch { return false; } };

// pems: the chain as the server sent it (leaf first). true only when it ends, by valid signatures, in one of the roots.
function verifyChain(pems, hostname, roots, now = Date.now()) {
  let chain;
  try { chain = pems.map((p) => new crypto.X509Certificate(p)); } catch { return false; }
  if (!chain.length || !chain[0].checkHost(hostname)) return false;
  for (let i = 0; i < chain.length && i < 5; i++) {
    const c = chain[i];
    if (!inDate(c, now)) return false;
    if (roots.some((r) => inDate(r, now) && signedBy(c, r))) return true;
    const next = chain[i + 1];
    if (!next || !next.ca || !signedBy(c, next)) return false;
  }
  return false;
}

// The PEM texts of the chain Chromium hands over (certificate → issuerCert → …).
function pemsOf(cert) {
  const out = [];
  for (let c = cert; c && out.length < 6; c = c.issuerCert) {
    if (!c.data || out.includes(c.data)) break;
    out.push(c.data);
  }
  return out;
}

module.exports = { loadRoots, verifyChain, pemsOf };
