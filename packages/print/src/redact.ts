/** v0.1 secret redact allowlist — applied on emit / copy / download. False positives OK. */

const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAWS_[A-Z0-9_]{3,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+=\/]{8,}\b/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const re of PATTERNS) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}
