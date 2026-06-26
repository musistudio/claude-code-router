import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import forge from "node-forge";
import { CERTDIR, PROXY_CA_CERT_DER_FILE, PROXY_CA_CERT_FILE, PROXY_CA_KEY_FILE } from "../../main/constants";

const pki = forge.pki;

export type CertificateAuthority = {
  cert: forge.pki.Certificate;
  key: forge.pki.rsa.PrivateKey;
};

export type PemPair = {
  cert: string;
  key: string;
};

type SubjectAltName = {
  ip?: string;
  type: 2 | 7;
  value?: string;
};

export function ensureProxyCertificateAuthority(): void {
  mkdirSync(CERTDIR, { recursive: true });
  if (existsSync(PROXY_CA_CERT_FILE) && existsSync(PROXY_CA_KEY_FILE)) {
    ensureProxyCertificateDerFile();
    return;
  }

  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = createSerialNumber();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 20);

  const attrs = [
    { name: "commonName", value: `Claude Code Router CA (${os.hostname()})` },
    { name: "countryName", value: "US" },
    { shortName: "ST", value: "California" },
    { name: "localityName", value: "San Francisco" },
    { name: "organizationName", value: "Claude Code Router" },
    { shortName: "OU", value: "CCR MITM Proxy" }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      cA: true,
      critical: true,
      name: "basicConstraints"
    },
    {
      critical: true,
      digitalSignature: true,
      keyCertSign: true,
      cRLSign: true,
      name: "keyUsage"
    },
    {
      name: "subjectKeyIdentifier"
    }
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  writeFileSync(PROXY_CA_CERT_FILE, pki.certificateToPem(cert), "utf8");
  writeFileSync(PROXY_CA_KEY_FILE, pki.privateKeyToPem(keys.privateKey), "utf8");
  ensureProxyCertificateDerFile();
}

export function proxyCertificateAuthorityExists(): boolean {
  return existsSync(PROXY_CA_CERT_FILE) && existsSync(PROXY_CA_KEY_FILE);
}

export function readProxyCertificateAuthority(): CertificateAuthority {
  ensureProxyCertificateAuthority();
  return {
    cert: pki.certificateFromPem(readFileSync(PROXY_CA_CERT_FILE, "utf8")),
    key: pki.privateKeyFromPem(readFileSync(PROXY_CA_KEY_FILE, "utf8")) as forge.pki.rsa.PrivateKey
  };
}

export function proxyCertificateAuthorityKeyMatches(): boolean {
  if (!proxyCertificateAuthorityExists()) {
    return false;
  }

  try {
    const authority = readProxyCertificateAuthority();
    const publicKey = authority.cert.publicKey as forge.pki.rsa.PublicKey;
    return authority.key.n.equals(publicKey.n) && authority.key.e.equals(publicKey.e);
  } catch {
    return false;
  }
}

export function readProxyCertificateFingerprintSha256(): string | undefined {
  if (!existsSync(PROXY_CA_CERT_FILE)) {
    return undefined;
  }

  try {
    return fingerprintPem(readFileSync(PROXY_CA_CERT_FILE, "utf8"), "sha256");
  } catch {
    return undefined;
  }
}

export function readProxyCertificateFingerprintSha1(): string | undefined {
  if (!existsSync(PROXY_CA_CERT_FILE)) {
    return undefined;
  }

  try {
    return fingerprintPem(readFileSync(PROXY_CA_CERT_FILE, "utf8"), "sha1");
  } catch {
    return undefined;
  }
}

export function readProxyCertificateSerialNumber(): string | undefined {
  if (!existsSync(PROXY_CA_CERT_FILE)) {
    return undefined;
  }

  try {
    const cert = pki.certificateFromPem(readFileSync(PROXY_CA_CERT_FILE, "utf8"));
    return cert.serialNumber;
  } catch {
    return undefined;
  }
}

export function createCertificateForHost(hostname: string, authority: CertificateAuthority): PemPair {
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = createSerialNumber();
  cert.validity.notBefore = new Date();
  cert.validity.notBefore.setDate(cert.validity.notBefore.getDate() - 1);
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);

  const attrs = [
    { name: "commonName", value: hostname },
    { name: "countryName", value: "US" },
    { shortName: "ST", value: "California" },
    { name: "localityName", value: "San Francisco" }
  ];

  cert.setIssuer(authority.cert.subject.attributes);
  cert.setSubject(attrs);
  cert.setExtensions([
    {
      cA: false,
      critical: true,
      name: "basicConstraints"
    },
    {
      critical: true,
      digitalSignature: true,
      keyEncipherment: true,
      name: "keyUsage"
    },
    {
      altNames: [subjectAltName(hostname)],
      name: "subjectAltName"
    },
    {
      name: "extKeyUsage",
      serverAuth: true
    },
    {
      name: "subjectKeyIdentifier"
    },
    {
      keyIdentifier: authority.cert.generateSubjectKeyIdentifier().getBytes(),
      name: "authorityKeyIdentifier"
    }
  ]);
  cert.sign(authority.key, forge.md.sha256.create());

  return {
    cert: pki.certificateToPem(cert),
    key: pki.privateKeyToPem(keys.privateKey)
  };
}

export function proxyCaCertFile(): string {
  return path.normalize(PROXY_CA_CERT_FILE);
}

export function proxyCaCertInstallFile(): string {
  return path.normalize(ensureProxyCertificateDerFile() ? PROXY_CA_CERT_DER_FILE : PROXY_CA_CERT_FILE);
}

function ensureProxyCertificateDerFile(): boolean {
  if (!existsSync(PROXY_CA_CERT_FILE)) {
    return false;
  }

  try {
    writeProxyCertificateDerFile(pki.certificateFromPem(readFileSync(PROXY_CA_CERT_FILE, "utf8")));
    return true;
  } catch {
    return false;
  }
}

function writeProxyCertificateDerFile(cert: forge.pki.Certificate): void {
  const der = forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
  writeFileSync(PROXY_CA_CERT_DER_FILE, Buffer.from(der, "binary"));
}

function createSerialNumber(): string {
  const bytes = randomBytes(16);
  bytes[0] &= 0x7f;
  if (bytes.every((byte) => byte === 0)) {
    bytes[15] = 1;
  }
  return bytes.toString("hex");
}

function fingerprintPem(pem: string, algorithm: "sha1" | "sha256"): string {
  const der = Buffer.from(
    pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, ""),
    "base64"
  );
  return createHash(algorithm)
    .update(der)
    .digest("hex")
    .match(/.{1,2}/g)!
    .join(":")
    .toUpperCase();
}

function subjectAltName(hostname: string): SubjectAltName {
  return net.isIP(hostname)
    ? {
        ip: hostname,
        type: 7
      }
    : {
        type: 2,
        value: hostname
      };
}
