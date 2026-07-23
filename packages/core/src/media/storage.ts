import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MediaArtifact, MediaJob } from "@ccr/core/media/contracts";

type JobStoreFile = {
  jobs: MediaJob[];
  version: 1;
};

const privateDirectoryMode = 0o700;
const privateFileMode = 0o600;
const maxArtifactBytes = 250 * 1024 * 1024;

export class MediaJobStore {
  private readonly file: string;
  private readonly jobs = new Map<string, MediaJob>();

  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { mode: privateDirectoryMode, recursive: true });
    this.file = path.join(rootDir, "jobs.json");
    this.load();
  }

  get(id: string): MediaJob | undefined {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }

  list(): MediaJob[] {
    return [...this.jobs.values()].map((job) => structuredClone(job));
  }

  put(job: MediaJob): MediaJob {
    this.jobs.set(job.id, structuredClone(job));
    this.flush();
    return structuredClone(job);
  }

  update(id: string, patch: Partial<MediaJob>): MediaJob {
    const current = this.jobs.get(id);
    if (!current) {
      throw new Error(`Media job not found: ${id}`);
    }
    const next: MediaJob = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(id, next);
    this.flush();
    return structuredClone(next);
  }

  deleteOlderThan(cutoffMs: number): MediaJob[] {
    const deleted: MediaJob[] = [];
    for (const [id, job] of this.jobs) {
      const timestamp = Date.parse(job.finishedAt ?? job.updatedAt);
      if (["canceled", "failed", "succeeded"].includes(job.status) && Number.isFinite(timestamp) && timestamp < cutoffMs) {
        this.jobs.delete(id);
        deleted.push(job);
      }
    }
    if (deleted.length) this.flush();
    return deleted;
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<JobStoreFile>;
      if (!Array.isArray(parsed.jobs)) return;
      for (const job of parsed.jobs) {
        if (job && typeof job.id === "string") this.jobs.set(job.id, job);
      }
    } catch (error) {
      console.warn(`[media-tools] Failed to load job store: ${formatError(error)}`);
    }
  }

  private flush(): void {
    mkdirSync(this.rootDir, { mode: privateDirectoryMode, recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ jobs: this.list(), version: 1 }, null, 2)}\n`, {
      encoding: "utf8",
      mode: privateFileMode
    });
    renameSync(temporary, this.file);
  }
}

export class MediaArtifactStore {
  readonly artifactsDir: string;

  constructor(private readonly rootDir: string) {
    this.artifactsDir = path.join(rootDir, "artifacts");
    mkdirSync(this.artifactsDir, { mode: privateDirectoryMode, recursive: true });
  }

  importFile(source: string, options: { contentType?: string; fileName?: string; ttlHours: number }): MediaArtifact {
    const sourceStats = statSync(source);
    if (!sourceStats.isFile() || sourceStats.size === 0) {
      throw new Error("Generated media artifact is empty or not a regular file.");
    }
    if (sourceStats.size > maxArtifactBytes) throw new Error("Generated media artifact exceeds the 250 MB limit.");
    const detected = detectMediaType(source);
    const mimeType = detected.mimeType;
    if (!mimeType) throw new Error("Generated file is not a supported image or video artifact.");
    const id = randomUUID();
    const extension = extensionForMimeType(mimeType) ?? detected.extension;
    const fileName = fileNameWithExtension(options.fileName ?? `media-${id}${extension}`, extension);
    const destination = path.join(this.artifactsDir, `${id}${extension}`);
    copyFileSync(source, destination);
    return this.describe(destination, id, fileName, mimeType, options.ttlHours);
  }

  writeBuffer(buffer: Buffer, options: { contentType?: string; fileName?: string; ttlHours: number }): MediaArtifact {
    if (buffer.byteLength === 0) throw new Error("Generated media artifact is empty.");
    if (buffer.byteLength > maxArtifactBytes) throw new Error("Generated media artifact exceeds the 250 MB limit.");
    const mimeType = detectMediaBufferType(buffer)?.mimeType;
    if (!mimeType) throw new Error("Generated response is not a supported image or video artifact.");
    const id = randomUUID();
    const extension = extensionForMimeType(mimeType) ?? ".bin";
    const destination = path.join(this.artifactsDir, `${id}${extension}`);
    writeFileSync(destination, buffer, { mode: privateFileMode });
    return this.describe(destination, id, fileNameWithExtension(options.fileName ?? `media-${id}${extension}`, extension), mimeType, options.ttlHours);
  }

  delete(artifact: MediaArtifact | undefined): void {
    if (!artifact) return;
    const resolved = path.resolve(artifact.localPath);
    if (!isPathInside(resolved, this.artifactsDir)) return;
    rmSync(resolved, { force: true });
  }

  private describe(file: string, id: string, fileName: string, mimeType: string, ttlHours: number): MediaArtifact {
    const sizeBytes = statSync(file).size;
    return {
      accessToken: randomBytes(24).toString("base64url"),
      expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
      fileName,
      id,
      localPath: file,
      mimeType,
      sha256: hashFile(file),
      sizeBytes
    };
  }
}

export function detectMediaType(file: string): { extension: string; mimeType?: string } {
  const descriptor = Buffer.alloc(32);
  const handle = openSync(file, "r");
  const length = readSync(handle, descriptor, 0, descriptor.length, 0);
  closeSync(handle);
  return detectMediaBufferType(descriptor.subarray(0, length)) ?? { extension: path.extname(file).toLowerCase() || ".bin" };
}

function hashFile(file: string): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const handle = openSync(file, "r");
  try {
    while (true) {
      const length = readSync(handle, buffer, 0, buffer.length, null);
      if (!length) break;
      hash.update(buffer.subarray(0, length));
    }
  } finally {
    closeSync(handle);
  }
  return hash.digest("hex");
}

function detectMediaBufferType(buffer: Buffer): { extension: string; mimeType: string } | undefined {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: ".png", mimeType: "image/png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: ".jpg", mimeType: "image/jpeg" };
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { extension: ".webp", mimeType: "image/webp" };
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (["avif", "avis", "mif1", "msf1"].includes(brand)) return { extension: ".avif", mimeType: "image/avif" };
    return { extension: ".mp4", mimeType: "video/mp4" };
  }
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { extension: ".webm", mimeType: "video/webm" };
  return undefined;
}

function extensionForMimeType(mimeType: string): string | undefined {
  return ({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm"
  } as Record<string, string>)[mimeType];
}

function sanitizeFileName(value: string): string {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "media.bin";
}

function fileNameWithExtension(value: string, extension: string): string {
  const sanitized = sanitizeFileName(value);
  return path.extname(sanitized) ? sanitized : `${sanitized}${extension}`;
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
