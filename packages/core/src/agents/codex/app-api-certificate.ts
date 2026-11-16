import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import forge from "node-forge";

/** A private loopback certificate, trusted only by the CCR-launched desktop. */
export function codexAppApiCertificate(configDir: string): { cert: string; key: string; spki: string } {
  const dir = path.join(configDir, "codex-desktop-api");
  const certFile = path.join(dir, "localhost.pem");
  const keyFile = path.join(dir, "localhost-key.pem");
  let cert: string;
  let key: string;
  try {
    cert = readFileSync(certFile, "utf8");
    key = readFileSync(keyFile, "utf8");
    const parsed = new X509Certificate(cert);
    if (Date.parse(parsed.validTo) < Date.now() + 86400_000) throw new Error("expired");
  } catch {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = "01" + randomBytes(15).toString("hex");
    certificate.validity.notBefore = new Date(Date.now() - 86400_000);
    certificate.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
    const subject = [{ name: "commonName", value: "CCR Codex localhost" }];
    certificate.setSubject(subject);
    certificate.setIssuer(subject);
    certificate.setExtensions([
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }
    ]);
    certificate.sign(keys.privateKey, forge.md.sha256.create());
    cert = forge.pki.certificateToPem(certificate);
    key = forge.pki.privateKeyToPem(keys.privateKey);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(keyFile, key, { mode: 0o600 });
    writeFileSync(certFile, cert, { mode: 0o600 });
  }
  chmodSync(keyFile, 0o600);
  const publicKey = new X509Certificate(cert).publicKey.export({ type: "spki", format: "der" });
  return { cert, key, spki: createHash("sha256").update(publicKey).digest("base64") };
}
