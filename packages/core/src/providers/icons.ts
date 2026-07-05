import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PROVIDER_ICON_CACHE_DIR } from "@ccr/core/config/constants";
import { fetchWithSystemProxy } from "@ccr/core/proxy/system-proxy-fetch";
import type { ProviderIconDetectionRequest, ProviderIconDetectionResult } from "@ccr/core/contracts/app";
import { compactProviderUrl, providerUrlWithDefaultScheme } from "@ccr/core/providers/url";

const faviconServiceUrl = "https://t0.gstatic.com/faviconV2";
const maxProviderIconBytes = 1024 * 1024;
const providerIconFetchTimeoutMs = 8_000;
const providerIconUserAgent = "Mozilla/5.0 (compatible; ClaudeCodeRouter/3.0; +https://github.com/)";

export async function detectProviderIcon(request: ProviderIconDetectionRequest): Promise<ProviderIconDetectionResult> {
  const siteUrls = providerIconSiteUrls(request.baseUrl);
  if (siteUrls.length === 0) {
    return {};
  }

  const cacheKey = providerIconCacheKey(siteUrls[0]);
  const cachedFile = request.force ? undefined : findCachedProviderIcon(cacheKey);
  if (cachedFile) {
    return {
      cachedFile,
      icon: pathToFileURL(cachedFile).toString()
    };
  }

  const candidates = await providerIconCandidateUrls(siteUrls, request.sourceUrls);
  for (const sourceUrl of candidates) {
    const downloaded = await downloadProviderIconCandidate(sourceUrl, cacheKey);
    if (downloaded) {
      return {
        cachedFile: downloaded,
        icon: pathToFileURL(downloaded).toString(),
        sourceUrl
      };
    }
  }

  return {};
}

function providerIconSiteUrls(value: string): string[] {
  const raw = value.trim();
  if (!raw) {
    return [];
  }

  try {
    const inputUrl = new URL(providerUrlWithDefaultScheme(raw));
    if (!["http:", "https:"].includes(inputUrl.protocol)) {
      return [];
    }
    inputUrl.username = "";
    inputUrl.password = "";
    inputUrl.hash = "";
    inputUrl.search = "";
    inputUrl.pathname = "/";

    const urls: string[] = [];
    const strippedHost = stripCommonProviderSubdomain(inputUrl.hostname);
    if (strippedHost && strippedHost !== inputUrl.hostname) {
      const strippedUrl = new URL(inputUrl.toString());
      strippedUrl.hostname = strippedHost;
      urls.push(compactProviderUrl(strippedUrl));
    }
    urls.push(compactProviderUrl(inputUrl));

    return uniqueStrings(urls);
  } catch {
    return [];
  }
}

async function providerIconCandidateUrls(siteUrls: string[], sourceUrls: string[] | undefined): Promise<string[]> {
  const explicitCandidates = providerIconSourceUrls(sourceUrls);
  const serviceCandidates = siteUrls.map((siteUrl) => {
    const params = new URLSearchParams({
      client: "SOCIAL",
      fallback_opts: "TYPE,SIZE,URL",
      size: "256",
      type: "FAVICON",
      url: siteUrl
    });
    return `${faviconServiceUrl}?${params.toString()}`;
  });
  const directCandidates = siteUrls.flatMap((siteUrl) => [
    new URL("/favicon.ico", siteUrl).toString(),
    new URL("/favicon.png", siteUrl).toString(),
    new URL("/apple-touch-icon.png", siteUrl).toString()
  ]);
  const htmlCandidates = await discoverHtmlProviderIconUrls(siteUrls);

  return uniqueStrings([...explicitCandidates, ...serviceCandidates, ...htmlCandidates, ...directCandidates]);
}

function providerIconSourceUrls(sourceUrls: string[] | undefined): string[] {
  if (!Array.isArray(sourceUrls)) {
    return [];
  }
  return sourceUrls
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? [url.toString()] : [];
      } catch {
        return [];
      }
    });
}

async function discoverHtmlProviderIconUrls(siteUrls: string[]): Promise<string[]> {
  const candidates: string[] = [];
  for (const siteUrl of siteUrls) {
    try {
      const response = await fetchWithTimeout(siteUrl);
      if (!response.ok) {
        continue;
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html")) {
        continue;
      }
      const html = await response.text();
      candidates.push(...parseHtmlIconLinks(html, siteUrl));
    } catch {
      // Icon discovery is best effort; direct and favicon-service candidates remain available.
    }
  }
  return uniqueStrings(candidates);
}

function parseHtmlIconLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = readHtmlAttribute(tag, "rel")?.toLowerCase() ?? "";
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|mask-icon)(\s|$)/i.test(rel)) {
      continue;
    }
    const href = readHtmlAttribute(tag, "href");
    if (!href) {
      continue;
    }
    try {
      const url = new URL(href, baseUrl);
      if (["http:", "https:"].includes(url.protocol)) {
        links.push(url.toString());
      }
    } catch {
      // Ignore malformed icon links from provider pages.
    }
  }
  return links;
}

function readHtmlAttribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

async function downloadProviderIconCandidate(sourceUrl: string, cacheKey: string): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(sourceUrl);
    if (!response.ok) {
      return undefined;
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > maxProviderIconBytes) {
      return undefined;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > maxProviderIconBytes) {
      return undefined;
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!isProviderIconImage(mimeType, buffer)) {
      return undefined;
    }

    const extension = providerIconExtension(mimeType, buffer, sourceUrl);
    mkdirSync(PROVIDER_ICON_CACHE_DIR, { recursive: true });
    const file = path.join(PROVIDER_ICON_CACHE_DIR, `${cacheKey}.${extension}`);
    writeFileSync(file, buffer);
    return file;
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerIconFetchTimeoutMs);
  try {
    return await fetchWithSystemProxy(url, {
      headers: {
        "User-Agent": providerIconUserAgent,
        Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.9,text/html;q=0.6,*/*;q=0.1"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function findCachedProviderIcon(cacheKey: string): string | undefined {
  if (!existsSync(PROVIDER_ICON_CACHE_DIR)) {
    return undefined;
  }
  const match = readdirSync(PROVIDER_ICON_CACHE_DIR)
    .find((filename) => filename.startsWith(`${cacheKey}.`) && providerIconFileExtensionIsAllowed(path.extname(filename).slice(1)));
  return match ? path.join(PROVIDER_ICON_CACHE_DIR, match) : undefined;
}

function providerIconCacheKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function stripCommonProviderSubdomain(hostname: string): string {
  return hostname.replace(/^(api|api-\w+|gateway|gateway-api|llm|llm-api|open)\./i, "");
}

function isProviderIconImage(mimeType: string, buffer: Buffer): boolean {
  if (mimeType.startsWith("image/")) {
    return true;
  }
  return Boolean(providerIconMagicExtension(buffer));
}

function providerIconExtension(mimeType: string, buffer: Buffer, sourceUrl: string): string {
  const fromMime = providerIconExtensionFromMime(mimeType);
  if (fromMime) {
    return fromMime;
  }

  const fromMagic = providerIconMagicExtension(buffer);
  if (fromMagic) {
    return fromMagic;
  }

  try {
    const fromPath = path.extname(new URL(sourceUrl).pathname).slice(1).toLowerCase();
    if (providerIconFileExtensionIsAllowed(fromPath)) {
      return fromPath;
    }
  } catch {
    // Fall through to png.
  }

  return "png";
}

function providerIconExtensionFromMime(mimeType: string): string | undefined {
  switch (mimeType) {
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/svg+xml":
      return "svg";
    case "image/vnd.microsoft.icon":
    case "image/x-icon":
      return "ico";
    case "image/webp":
      return "webp";
    default:
      return undefined;
  }
}

function providerIconMagicExtension(buffer: Buffer): string | undefined {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) {
    return "ico";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "GIF8") {
    return "gif";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  if (buffer.length >= 12 && buffer.subarray(4, 12).toString("ascii") === "ftypavif") {
    return "avif";
  }
  return undefined;
}

function providerIconFileExtensionIsAllowed(extension: string): boolean {
  return ["avif", "gif", "ico", "jpg", "jpeg", "png", "svg", "webp"].includes(extension.toLowerCase());
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}
