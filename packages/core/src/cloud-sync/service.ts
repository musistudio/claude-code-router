import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import type {
  AppConfig,
  CloudSyncConflictField,
  CloudSyncConflictFieldResolution,
  CloudSyncConflictResolution,
  CloudSyncKeyFileResult,
  CloudSyncConfig,
  CloudSyncKeyInput,
  CloudSyncLoginResult,
  CloudSyncOperationResult,
  CloudSyncPullRequest,
  CloudSyncPushRequest,
  CloudSyncResolveConflictRequest,
  CloudSyncSetupRequest,
  CloudSyncStatus
} from "@ccr/core/contracts/app";
import { CLOUD_SYNC_DEFAULT_BASE_URL } from "@ccr/core/contracts/app";

type CloudSyncKeyMaterial = {
  key: Buffer;
  keyId: string;
  keyMode: CloudSyncConfig["keyMode"];
  keySalt: string;
};

type CloudSyncSnapshotConfig = Pick<
  AppConfig,
  | "Providers"
  | "Router"
  | "agent"
  | "botConfigs"
  | "botGateway"
  | "mediaTools"
  | "plugins"
  | "preferredProvider"
  | "profile"
  | "providerPlugins"
  | "toolHub"
  | "virtualModelProfiles"
>;

type CloudSyncSnapshot = {
  config: CloudSyncSnapshotConfig;
  exportedAt: string;
  kind: "claude-code-router-cloud-sync-snapshot";
  version: 1;
};

type EncryptedPayload = {
  algorithm: "aes-256-gcm";
  ciphertext: string;
  encoding: "base64";
  keyId: string;
  metadata: {
    kdf: "pbkdf2-sha256";
    kdfIterations: number;
    keySalt: string;
    snapshotVersion?: number;
  };
  nonce: string;
  tag: string;
};

type CloudTokenResponse = {
  accessToken?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  tokenType?: string;
  user?: CloudUserResponse;
};

type CloudTokenRefreshPatch = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt?: string;
};

type CloudUserResponse = {
  avatarUrl?: string | null;
  email?: string | null;
  githubLogin?: string;
  githubName?: string | null;
  id?: string;
};

type CloudDeviceResponse = {
  id?: string;
  name?: string;
};

type CloudSyncAuthTokenInput = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt?: string;
  userAvatarUrl?: string;
  userEmail?: string;
  userId?: string;
  userLogin?: string;
  userName?: string;
};

type CloudDocument = {
  encryptedSnapshot?: EncryptedPayload | null;
  id?: string | null;
  namespace: string;
  revision: number;
  snapshotHash?: string | null;
  snapshotRevision?: number | null;
  updatedAt?: string | null;
};

type CloudOperation = {
  baseRevision?: number;
  clientOperationId?: string;
  encryptedPayload?: EncryptedPayload | null;
  id?: string;
  revision?: number;
};

type CloudPullPagination = {
  excludeOperationId?: string | null;
  hasMore?: boolean;
  limit?: number;
  nextRevision?: number | null;
};

type CloudPullResponse = {
  document: CloudDocument;
  operations?: CloudOperation[];
  pagination?: CloudPullPagination;
};

type CloudPushResponse = {
  accepted?: boolean;
  conflict?: boolean;
  document?: CloudDocument;
  idempotent?: boolean;
  mergeRequired?: boolean;
  missingOperations?: CloudOperation[];
  missingOperationsExcludeOperationId?: string;
  missingOperationsHasMore?: boolean;
  nextMissingRevision?: number | null;
  operation?: CloudOperation;
  snapshotAccepted?: boolean;
  snapshotRejectedReason?: string;
};

type CloudRequestOptions = {
  body?: unknown;
  method?: "GET" | "POST";
};

type CloudSyncMergeResult = {
  conflictFields: CloudSyncConflictField[];
  conflicts: string[];
  snapshot: CloudSyncSnapshot;
};

type CloudSyncConflictPreference = NonNullable<CloudSyncResolveConflictRequest["preference"]>;
type CloudSyncConflictResultMap = Map<
  string,
  unknown | typeof missingCloudSyncMergeValue
>;

type CloudSyncSnapshotOperation = {
  kind: "replace-cloud-sync-snapshot";
  snapshot: CloudSyncSnapshot;
  snapshotHash: string;
  snapshotVersion: number;
  updatedAt: string;
  version: 2;
};

type CloudOperationCollection = {
  config: AppConfig;
  document?: CloudDocument;
  operations: CloudOperation[];
};

type CloudSyncPushOptions = {
  keyMaterial?: CloudSyncKeyMaterial;
  mergeOnConflict?: boolean;
  setupMessage?: boolean;
};

type CloudSyncLoginOptions = {
  callbackUrl?: string;
};

type PendingCloudSyncAuth = {
  expiresAt: number;
  verifier: string;
};

type PendingCloudSyncConflict = {
  baseSnapshot?: CloudSyncSnapshot;
  descriptor: CloudSyncConflictResolution;
  identity: string;
  keyMaterial: CloudSyncKeyMaterial;
  localSnapshot: CloudSyncSnapshot;
  remoteSnapshot: CloudSyncSnapshot;
  remoteSnapshotHash?: string;
};

const cloudSyncSnapshotKind = "claude-code-router-cloud-sync-snapshot";
const defaultCloudSyncNamespace = "ccr";
const keyFileKind = "claude-code-router-cloud-sync-key";
const keyFileVersion = 1;
const keyDerivationIterations = 310_000;
const privateFileMode = 0o600;
const privateDirMode = 0o700;
const missingCloudSyncMergeValue = Symbol("missing-cloud-sync-merge-value");
const cloudSyncAuthExpiredMessage = "Cloud sync login expired. Sign in again.";
const cloudSyncAuthAttemptMs = 10 * 60 * 1000;
const cloudSyncConflictResolutionMs = 30 * 60 * 1000;

const cloudSyncKeyCache = new Map<string, Buffer>();
const pendingCloudSyncAuth = new Map<string, PendingCloudSyncAuth>();
const pendingCloudSyncConflicts = new Map<string, PendingCloudSyncConflict>();
const pendingCloudSyncConflictIds = new Map<string, string>();
const cloudTokenRefreshInFlight = new Map<string, Promise<CloudTokenRefreshPatch>>();
const cloudTokenRefreshRecent = new Map<string, { expiresAt: number; patch: CloudTokenRefreshPatch }>();
const cloudTokenRefreshRecentMs = 30 * 60 * 1000;

class CloudSyncAuthExpiredError extends Error {
  readonly config: AppConfig;

  constructor(config: AppConfig, message = cloudSyncAuthExpiredMessage) {
    super(message);
    this.name = "CloudSyncAuthExpiredError";
    this.config = config;
  }
}

class CloudSyncRefreshTokenExpiredError extends Error {
  constructor(message = cloudSyncAuthExpiredMessage) {
    super(message);
    this.name = "CloudSyncRefreshTokenExpiredError";
  }
}

export function getCloudSyncStatus(config: AppConfig): CloudSyncStatus {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const unlocked = Boolean(cloudSync.keyId && cloudSyncKeyCache.has(cloudSync.keyId));
  const pendingConflict = pendingCloudSyncConflictForConfig(config)?.descriptor;

  return {
    authenticated: Boolean(cloudSync.accessToken || cloudSync.refreshToken),
    baseUrl: cloudSync.baseUrl,
    configured: Boolean(cloudSync.baseUrl && cloudSync.keyId && cloudSync.keySalt),
    deviceId: cloudSync.deviceId,
    deviceName: cloudSync.deviceName,
    enabled: cloudSync.enabled,
    keyId: cloudSync.keyId,
    keyMode: cloudSync.keyMode,
    lastRevision: cloudSync.lastRevision,
    lastSyncAt: cloudSync.lastSyncAt,
    lastSyncError: cloudSync.lastSyncError,
    namespace: cloudSync.namespace,
    pendingConflict,
    snapshotHash: cloudSync.snapshotHash,
    unlocked,
    userAvatarUrl: cloudSync.userAvatarUrl,
    userEmail: cloudSync.userEmail,
    userId: cloudSync.userId,
    userLogin: cloudSync.userLogin,
    userName: cloudSync.userName
  };
}

export function disableCloudSyncConfig(config: AppConfig): AppConfig {
  clearPendingCloudSyncConflict(config);
  if (config.cloudSync.keyId) {
    cloudSyncKeyCache.delete(config.cloudSync.keyId);
  }

  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      accessToken: undefined,
      enabled: false,
      lastSyncError: undefined,
      refreshToken: undefined,
      refreshTokenExpiresAt: undefined,
      userAvatarUrl: undefined,
      userEmail: undefined,
      userId: undefined,
      userLogin: undefined,
      userName: undefined
    }
  };
}

export function startCloudSyncLogin(config: AppConfig, options: CloudSyncLoginOptions = {}): CloudSyncLoginResult {
  const nextConfig = prepareCloudSyncAuthConfig(config);
  return {
    config: nextConfig,
    loginUrl: cloudSyncLoginUrl(options.callbackUrl),
    message: "Open the browser to complete cloud sync login.",
    status: getCloudSyncStatus(nextConfig)
  };
}

export async function completeCloudSyncLogin(config: AppConfig, rawCallbackUrl: string): Promise<AppConfig> {
  const callbackUrl = new URL(requiredString(rawCallbackUrl, "Cloud sync callback URL"));
  const code = requiredString(callbackUrl.searchParams.get("code"), "Cloud sync handoff code");
  const handoffExpiresAt = optionalString(callbackUrl.searchParams.get("expires_at"));
  if (handoffExpiresAt) {
    const expiresAt = Date.parse(handoffExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("Cloud sync login handoff expired. Sign in again.");
    }
  }

  const callbackKey = cloudSyncAuthCallbackKey(callbackUrl);
  const pending = pendingCloudSyncAuth.get(callbackKey);
  pendingCloudSyncAuth.delete(callbackKey);
  if (!pending || pending.expiresAt <= Date.now()) {
    throw new Error("Cloud sync login session is invalid or expired. Sign in again.");
  }

  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const response = await fetch(cloudSyncUrl(cloudSync.baseUrl, "/auth/handoff"), {
    body: JSON.stringify({
      code,
      codeVerifier: pending.verifier
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const data = await readCloudResponse(response);
  if (!response.ok) {
    throw new Error(`Cloud login handoff failed (${response.status}): ${cloudErrorMessage(data)}`);
  }

  const tokenResponse = data as CloudTokenResponse;
  const user = tokenResponse.user;
  return applyCloudSyncAuthTokens(config, {
    accessToken: requiredString(tokenResponse.accessToken, "Cloud access token"),
    refreshToken: requiredString(tokenResponse.refreshToken, "Cloud refresh token"),
    refreshTokenExpiresAt: optionalString(tokenResponse.refreshTokenExpiresAt),
    userAvatarUrl: optionalString(user?.avatarUrl),
    userEmail: optionalString(user?.email),
    userId: optionalString(user?.id),
    userLogin: optionalString(user?.githubLogin),
    userName: optionalString(user?.githubName)
  });
}

export function applyCloudSyncAuthTokens(config: AppConfig, input: CloudSyncAuthTokenInput): AppConfig {
  const accessToken = requiredString(input.accessToken, "Cloud access token");
  const refreshToken = requiredString(input.refreshToken, "Cloud refresh token");
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  return {
    ...config,
    cloudSync: {
      ...cloudSync,
      accessToken,
      baseUrl: CLOUD_SYNC_DEFAULT_BASE_URL,
      deviceName: cloudSync.deviceName || defaultDeviceName(),
      lastSyncError: undefined,
      refreshToken,
      refreshTokenExpiresAt: optionalString(input.refreshTokenExpiresAt),
      ...cloudSyncUserProfilePatch(input)
    }
  };
}

export async function refreshCloudSyncUserProfile(config: AppConfig): Promise<AppConfig> {
  const response = await cloudRequest<CloudUserResponse>(config, "/auth/me");
  return withCloudSyncUserProfile(response.config, response.data);
}

export async function ensureCloudSyncUserProfile(config: AppConfig): Promise<AppConfig> {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  if (!cloudSync.accessToken && !cloudSync.refreshToken) {
    return {
      ...config,
      cloudSync
    };
  }
  if (cloudSync.userAvatarUrl || cloudSync.userEmail || cloudSync.userLogin || cloudSync.userName) {
    return {
      ...config,
      cloudSync
    };
  }

  try {
    return await refreshCloudSyncUserProfile({
      ...config,
      cloudSync
    });
  } catch (error) {
    if (isCloudSyncAuthExpiredError(error)) {
      return error.config;
    }
    return {
      ...config,
      cloudSync: {
        ...cloudSync,
        lastSyncError: formatError(error)
      }
    };
  }
}

export function createCloudSyncKeyFile(file: string): CloudSyncKeyFileResult {
  const keyFilePath = requiredString(file, "Cloud sync key file path");
  writeCloudSyncKeyFile(keyFilePath);
  return {
    canceled: false,
    file: keyFilePath
  };
}

export async function setupCloudSyncConfig(
  config: AppConfig,
  request: CloudSyncSetupRequest
): Promise<CloudSyncOperationResult> {
  return withCloudSyncOperationAuthHandling(() => setupCloudSyncConfigInternal(config, request));
}

async function setupCloudSyncConfigInternal(
  config: AppConfig,
  request: CloudSyncSetupRequest
): Promise<CloudSyncOperationResult> {
  const baseUrl = CLOUD_SYNC_DEFAULT_BASE_URL;
  const accessToken = requiredString(config.cloudSync.accessToken, "Cloud access token");
  const refreshToken = optionalString(config.cloudSync.refreshToken);
  const deviceName = optionalString(config.cloudSync.deviceName) || defaultDeviceName();
  const existingCloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const preparedConfig: AppConfig = {
    ...config,
    cloudSync: {
      ...existingCloudSync,
      accessToken,
      baseUrl,
      deviceName,
      enabled: true,
      lastSyncError: undefined,
      namespace: existingCloudSync.namespace || defaultCloudSyncNamespace,
      refreshToken,
      refreshTokenExpiresAt: optionalString(existingCloudSync.refreshTokenExpiresAt)
    }
  };
  let nextConfig: AppConfig = preparedConfig;

  nextConfig = await refreshCloudSyncUserProfile(nextConfig);

  const device = await cloudRequest<CloudDeviceResponse>(nextConfig, "/sync/devices", {
    body: {
      name: deviceName,
      platform: `${process.platform}-${process.arch}`
    },
    method: "POST"
  });
  nextConfig = {
    ...device.config,
    cloudSync: {
      ...device.config.cloudSync,
      deviceId: device.data.id || device.config.cloudSync.deviceId,
      userId: device.config.cloudSync.userId
    }
  };

  let remote = await pullCloudDocument(nextConfig, 0);
  if (
    remote.data.document.encryptedSnapshot &&
    remote.data.document.snapshotRevision === null
  ) {
    remote = await pullAllCloudDocuments(remote.config, 0);
  }
  nextConfig = remote.config;
  if (remote.data.document.revision > 0) {
    const encryptedSnapshot = remote.data.document.encryptedSnapshot;
    if (!encryptedSnapshot) {
      throw new Error("Cloud sync is configured, but the remote document has no decryptable snapshot.");
    }
    const keySalt = nextConfig.cloudSync.keySalt || keySaltFromEncryptedPayload(encryptedSnapshot);
    const keyMaterial = resolveCloudSyncKey({
      ...nextConfig.cloudSync,
      keySalt
    }, request, { allowCreateSalt: false });
    nextConfig = {
      ...nextConfig,
      cloudSync: {
        ...nextConfig.cloudSync,
        keyId: keyMaterial.keyId,
        keyMode: keyMaterial.keyMode,
        keySalt: keyMaterial.keySalt
      }
    };
    const snapshot = resolveCloudDocumentSnapshot(
      remote.data.document,
      remote.data.operations ?? [],
      keyMaterial
    ).snapshot;
    nextConfig = applyCloudSyncSnapshot(nextConfig, snapshot);
    nextConfig = withCloudSyncSuccess(nextConfig, {
      lastRevision: remote.data.document.revision,
      snapshotHash: remote.data.document.snapshotHash || snapshotHash(snapshot)
    }, snapshot);
    return {
      config: nextConfig,
      message: "Cloud sync is enabled and the remote encrypted snapshot was restored on this device.",
      remoteRevision: remote.data.document.revision,
      snapshotApplied: true,
      status: getCloudSyncStatus(nextConfig)
    };
  }

  if (request.restoreOnly) {
    nextConfig = {
      ...nextConfig,
      cloudSync: {
        ...nextConfig.cloudSync,
        enabled: false,
        lastRevision: remote.data.document.revision,
        lastSyncError: "Cloud sync has no remote snapshot yet.",
        snapshotHash: remote.data.document.snapshotHash || undefined
      }
    };
    return {
      config: nextConfig,
      message: "Cloud sync has no remote snapshot yet.",
      remoteRevision: remote.data.document.revision,
      snapshotApplied: false,
      status: getCloudSyncStatus(nextConfig)
    };
  }

  const keyMaterial = resolveCloudSyncKey(nextConfig.cloudSync, request, { allowCreateSalt: true });
  nextConfig = {
    ...nextConfig,
    cloudSync: {
      ...nextConfig.cloudSync,
      keyId: keyMaterial.keyId,
      keyMode: keyMaterial.keyMode,
      keySalt: keyMaterial.keySalt
    }
  };
  return pushCloudSyncConfigInternal(nextConfig, {}, { keyMaterial, setupMessage: true });
}

export async function pushCloudSyncConfig(
  config: AppConfig,
  request: CloudSyncPushRequest = {}
): Promise<CloudSyncOperationResult> {
  return withCloudSyncOperationAuthHandling(() => pushCloudSyncConfigInternal(config, request, {}));
}

export async function pullCloudSyncConfig(
  config: AppConfig,
  request: CloudSyncPullRequest = {}
): Promise<CloudSyncOperationResult> {
  return withCloudSyncOperationAuthHandling(() => pullCloudSyncConfigInternal(config, request));
}

export async function resolveCloudSyncConflict(
  config: AppConfig,
  request: CloudSyncResolveConflictRequest
): Promise<CloudSyncOperationResult> {
  return withCloudSyncOperationAuthHandling(
    () => resolveCloudSyncConflictInternal(config, request)
  );
}

async function resolveCloudSyncConflictInternal(
  config: AppConfig,
  request: CloudSyncResolveConflictRequest
): Promise<CloudSyncOperationResult> {
  const conflictId = requiredString(request.conflictId, "Cloud sync conflict ID");
  const pending = pendingCloudSyncConflictById(conflictId);
  if (!pending || pending.identity !== cloudSyncConflictIdentity(config)) {
    throw new Error("Cloud sync conflict expired or is no longer available. Sync again to refresh it.");
  }
  const conflictResults = cloudSyncConflictResultsFromRequest(request, pending.descriptor);
  const preference = request.preference ?? "local";
  if (
    request.preference !== undefined &&
    request.preference !== "local" &&
    request.preference !== "remote"
  ) {
    throw new Error("Cloud sync conflict preference must be local or remote.");
  }
  if (!conflictResults && request.preference === undefined) {
    throw new Error("Cloud sync conflict preference or reviewed resolutions are required.");
  }
  const currentSnapshot = createCloudSyncSnapshot(config);
  if (!sameCloudSyncValue(currentSnapshot.config, pending.localSnapshot.config)) {
    removePendingCloudSyncConflict(conflictId);
    return cloudSyncConflictResult(
      config,
      "Local configuration changed after the conflict was detected. Sync again before choosing a version.",
      pending.descriptor.remoteRevision,
      pending.descriptor.paths
    );
  }
  const latestRemote = await pullCloudDocument(config, pending.descriptor.remoteRevision);
  if (latestRemote.data.document.revision !== pending.descriptor.remoteRevision) {
    removePendingCloudSyncConflict(conflictId);
    return pullCloudSyncConfigInternal(latestRemote.config);
  }
  config = latestRemote.config;

  const merge = pending.baseSnapshot
    ? mergeCloudSyncSnapshots(
      pending.baseSnapshot,
      pending.localSnapshot,
      pending.remoteSnapshot,
      preference,
      conflictResults
    )
    : resolveCloudSyncConflictWithoutBase(pending, preference, conflictResults);
  let mergedConfig = applyCloudSyncSnapshot(config, merge.snapshot);
  mergedConfig = {
    ...mergedConfig,
    cloudSync: {
      ...normalizedCloudSyncConfig(mergedConfig.cloudSync),
      lastRevision: pending.descriptor.remoteRevision,
      lastSyncError: undefined,
      lastSyncedSnapshot: cloneJson(pending.remoteSnapshot),
      snapshotHash: pending.remoteSnapshotHash || snapshotHash(pending.remoteSnapshot)
    }
  };

  if (sameCloudSyncValue(merge.snapshot.config, pending.remoteSnapshot.config)) {
    removePendingCloudSyncConflict(conflictId);
    mergedConfig = withCloudSyncSuccess(mergedConfig, {
      lastRevision: pending.descriptor.remoteRevision,
      snapshotHash: pending.remoteSnapshotHash || snapshotHash(pending.remoteSnapshot)
    }, pending.remoteSnapshot);
    return {
      config: mergedConfig,
      conflict: true,
      mergeApplied: true,
      mergeConflicts: pending.descriptor.paths,
      message: conflictResults
        ? "Cloud conflict was resolved using the reviewed values."
        : "Cloud conflict was resolved using cloud values.",
      remoteRevision: pending.descriptor.remoteRevision,
      snapshotApplied: true,
      snapshotPushed: false,
      status: getCloudSyncStatus(mergedConfig)
    };
  }

  const pushed = await pushCloudSyncConfigInternal(mergedConfig, {}, {
    keyMaterial: pending.keyMaterial
  });
  if (pushed.conflictResolution || !pushed.snapshotPushed) {
    return pushed;
  }
  return {
    ...pushed,
    conflict: true,
    mergeApplied: true,
    mergeConflicts: pending.descriptor.paths,
    message: conflictResults
      ? "Cloud conflict was resolved using the reviewed values and the merged snapshot was pushed."
      : preference === "local"
      ? "Cloud conflict was resolved using local values and the merged snapshot was pushed."
      : "Cloud conflict was resolved using cloud values and independent local changes were pushed.",
    snapshotApplied: true
  };
}

function cloudSyncConflictResultsFromRequest(
  request: CloudSyncResolveConflictRequest,
  descriptor: CloudSyncConflictResolution
): CloudSyncConflictResultMap | undefined {
  if (request.resolutions === undefined) {
    return undefined;
  }
  if (!Array.isArray(request.resolutions)) {
    throw new Error("Cloud sync conflict resolutions must be an array.");
  }

  const expectedPaths = new Set(descriptor.fields.map((field) => field.path));
  const results: CloudSyncConflictResultMap = new Map();
  for (const item of request.resolutions as CloudSyncConflictFieldResolution[]) {
    if (!isObject(item)) {
      throw new Error("Each cloud sync conflict resolution must be an object.");
    }
    const path = requiredString(item.path, "Cloud sync conflict path");
    if (!expectedPaths.has(path)) {
      throw new Error(`Cloud sync conflict path is no longer available: ${path}`);
    }
    if (results.has(path)) {
      throw new Error(`Cloud sync conflict path was resolved more than once: ${path}`);
    }
    if (!isObject(item.result) || typeof item.result.exists !== "boolean") {
      throw new Error(`Cloud sync conflict result is invalid for ${path}.`);
    }
    if (!item.result.exists) {
      results.set(path, missingCloudSyncMergeValue);
      continue;
    }
    if (!Object.hasOwn(item.result, "value")) {
      throw new Error(`Cloud sync conflict result value is required for ${path}.`);
    }
    const serialized = JSON.stringify(item.result.value);
    if (serialized === undefined) {
      throw new Error(`Cloud sync conflict result must be valid JSON for ${path}.`);
    }
    results.set(path, JSON.parse(serialized));
  }

  const unresolvedPaths = [...expectedPaths].filter((path) => !results.has(path));
  if (unresolvedPaths.length > 0 || results.size !== expectedPaths.size) {
    throw new Error(
      `Resolve every cloud sync conflict field before applying: ${unresolvedPaths.join(", ")}`
    );
  }
  return results;
}

function resolveCloudSyncConflictWithoutBase(
  pending: PendingCloudSyncConflict,
  preference: CloudSyncConflictPreference,
  conflictResults?: CloudSyncConflictResultMap
): CloudSyncMergeResult {
  const preferredSnapshot = preference === "local"
    ? pending.localSnapshot
    : pending.remoteSnapshot;
  const resolvedConfig = conflictResults?.has("config")
    ? conflictResults.get("config")
    : preferredSnapshot.config;
  if (isMissingCloudSyncMergeValue(resolvedConfig) || !isObject(resolvedConfig)) {
    throw new Error("The reviewed cloud sync result must contain a configuration object.");
  }
  return {
    conflictFields: pending.descriptor.fields,
    conflicts: pending.descriptor.paths,
    snapshot: {
      ...cloneJson(preferredSnapshot),
      config: cloneJson(resolvedConfig) as CloudSyncSnapshotConfig,
      exportedAt: new Date().toISOString()
    }
  };
}

async function pullCloudSyncConfigInternal(
  config: AppConfig,
  request: CloudSyncPullRequest = {}
): Promise<CloudSyncOperationResult> {
  const readyConfig = requireCloudSyncEnabled(config);
  const keyMaterial = resolveCloudSyncKey(readyConfig.cloudSync, request, { allowCreateSalt: false });
  const baseSnapshot = cloudSyncSnapshotFromUnknown(readyConfig.cloudSync.lastSyncedSnapshot);
  let remote = baseSnapshot
    ? await pullAllCloudDocuments(readyConfig, readyConfig.cloudSync.lastRevision)
    : await pullCloudDocument(readyConfig, readyConfig.cloudSync.lastRevision);
  if (
    remote.data.document.encryptedSnapshot &&
    remote.data.document.snapshotRevision === null
  ) {
    remote = await pullAllCloudDocuments(remote.config, 0);
  }
  let nextConfig = remote.config;
  const document = remote.data.document;

  if (!document.encryptedSnapshot || document.revision === 0) {
    nextConfig = withCloudSyncSuccess(nextConfig, {
      lastRevision: document.revision,
      snapshotHash: document.snapshotHash || undefined
    });
    return {
      config: nextConfig,
      message: "Cloud sync has no remote snapshot yet.",
      remoteRevision: document.revision,
      snapshotApplied: false,
      status: getCloudSyncStatus(nextConfig)
    };
  }

  const remoteMerge = resolveCloudDocumentSnapshot(
    document,
    remote.data.operations ?? [],
    keyMaterial
  );
  const remoteSnapshot = remoteMerge.snapshot;
  let appliedSnapshot = remoteSnapshot;
  let localMerge: CloudSyncMergeResult | undefined;
  let localSnapshot: CloudSyncSnapshot | undefined;
  if (request.apply !== false) {
    localSnapshot = createCloudSyncSnapshot(nextConfig);
    if (!baseSnapshot && !sameCloudSyncValue(localSnapshot.config, remoteSnapshot.config)) {
      return cloudSyncResolutionRequiredResult({
        config: nextConfig,
        keyMaterial,
        localSnapshot,
        paths: ["config"],
        remoteRevision: document.revision,
        remoteSnapshot,
        remoteSnapshotHash: document.snapshotHash || snapshotHash(remoteSnapshot)
      });
    }
    if (
      baseSnapshot &&
      !sameCloudSyncValue(localSnapshot.config, baseSnapshot.config) &&
      !sameCloudSyncValue(remoteSnapshot.config, baseSnapshot.config)
    ) {
      localMerge = mergeCloudSyncSnapshots(baseSnapshot, localSnapshot, remoteSnapshot);
      appliedSnapshot = localMerge.snapshot;
    }
  }
  const mergeConflicts = uniqueStrings([
    ...remoteMerge.conflicts,
    ...(localMerge?.conflicts ?? [])
  ]);
  if (
    request.apply !== false &&
    baseSnapshot &&
    localSnapshot &&
    mergeConflicts.length > 0
  ) {
    return cloudSyncResolutionRequiredResult({
      baseSnapshot,
      config: nextConfig,
      keyMaterial,
      localSnapshot,
      paths: mergeConflicts,
      remoteRevision: document.revision,
      remoteSnapshot,
      remoteSnapshotHash: document.snapshotHash || snapshotHash(remoteSnapshot)
    });
  }
  if (request.apply !== false) {
    nextConfig = applyCloudSyncSnapshot(nextConfig, appliedSnapshot);
  }
  nextConfig = withCloudSyncSuccess(nextConfig, {
    lastRevision: document.revision,
    snapshotHash: remoteMerge.appliedOperationCount > 0
      ? snapshotHash(remoteSnapshot)
      : document.snapshotHash || snapshotHash(remoteSnapshot)
  }, remoteSnapshot);

  const mergeApplied = request.apply !== false &&
    Boolean(localMerge || remoteMerge.appliedOperationCount > 0);

  return {
    config: nextConfig,
    message: request.apply === false
      ? "Cloud encrypted snapshot was decrypted successfully."
      : mergeApplied
        ? mergeConflicts.length > 0
          ? `Cloud changes were pulled and merged. Local values were kept for ${mergeConflicts.length} conflicting path(s).`
          : "Cloud changes were pulled and merged."
        : "Cloud encrypted snapshot was pulled and applied.",
    mergeApplied,
    mergeConflicts,
    remoteRevision: document.revision,
    snapshotApplied: request.apply !== false,
    status: getCloudSyncStatus(nextConfig)
  };
}

export async function autoPushCloudSyncConfig(config: AppConfig): Promise<AppConfig> {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  if (!cloudSync.enabled || !cloudSync.keyId || !cloudSyncKeyCache.has(cloudSync.keyId)) {
    return config;
  }
  if (pendingCloudSyncConflictForConfig(config)) {
    return config;
  }

  try {
    const result = await pushCloudSyncConfig(config);
    return result.config ?? config;
  } catch (error) {
    if (isCloudSyncAuthExpiredError(error)) {
      return error.config;
    }
    return {
      ...config,
      cloudSync: {
        ...cloudSync,
        lastSyncError: formatError(error)
      }
    };
  }
}

export function createCloudSyncSnapshot(config: AppConfig, exportedAt = new Date().toISOString()): CloudSyncSnapshot {
  return {
    config: {
      Providers: cloneJson(config.Providers),
      Router: cloneJson(config.Router),
      agent: cloneJson(config.agent),
      botConfigs: cloneJson(config.botConfigs),
      botGateway: cloneJson(config.botGateway),
      mediaTools: cloneJson(config.mediaTools),
      plugins: cloneJson(config.plugins),
      preferredProvider: config.preferredProvider,
      profile: cloneJson(config.profile),
      providerPlugins: cloneJson(config.providerPlugins ?? []),
      toolHub: cloneJson(config.toolHub),
      virtualModelProfiles: cloneJson(config.virtualModelProfiles ?? [])
    },
    exportedAt,
    kind: cloudSyncSnapshotKind,
    version: 1
  };
}

export function applyCloudSyncSnapshot(config: AppConfig, snapshot: CloudSyncSnapshot): AppConfig {
  if (snapshot.kind !== cloudSyncSnapshotKind || snapshot.version !== 1 || !isObject(snapshot.config)) {
    throw new Error("Cloud snapshot has an unsupported format.");
  }

  return {
    ...config,
    Providers: cloneJson(snapshot.config.Providers ?? config.Providers),
    Router: cloneJson(snapshot.config.Router ?? config.Router),
    agent: cloneJson(snapshot.config.agent ?? config.agent),
    botConfigs: cloneJson(snapshot.config.botConfigs ?? config.botConfigs),
    botGateway: cloneJson(snapshot.config.botGateway ?? config.botGateway),
    mediaTools: cloneJson(snapshot.config.mediaTools ?? config.mediaTools),
    plugins: cloneJson(snapshot.config.plugins ?? config.plugins),
    preferredProvider: typeof snapshot.config.preferredProvider === "string"
      ? snapshot.config.preferredProvider
      : config.preferredProvider,
    profile: cloneJson(snapshot.config.profile ?? config.profile),
    providerPlugins: cloneJson(snapshot.config.providerPlugins ?? config.providerPlugins ?? []),
    toolHub: cloneJson(snapshot.config.toolHub ?? config.toolHub),
    virtualModelProfiles: cloneJson(snapshot.config.virtualModelProfiles ?? config.virtualModelProfiles ?? [])
  };
}

function mergeCloudSyncSnapshots(
  base: CloudSyncSnapshot,
  local: CloudSyncSnapshot,
  remote: CloudSyncSnapshot,
  conflictPreference: CloudSyncConflictPreference = "local",
  conflictResults?: CloudSyncConflictResultMap
): CloudSyncMergeResult {
  const conflicts: string[] = [];
  const conflictFields: CloudSyncConflictField[] = [];
  const mergedConfig = mergeCloudSyncValue(
    base.config,
    local.config,
    remote.config,
    "config",
    conflicts,
    conflictPreference,
    conflictFields,
    conflictResults
  );
  if (isMissingCloudSyncMergeValue(mergedConfig) || !isObject(mergedConfig)) {
    throw new Error("Cloud sync merge produced an invalid snapshot.");
  }

  return {
    conflictFields,
    conflicts,
    snapshot: {
      config: mergedConfig as CloudSyncSnapshotConfig,
      exportedAt: new Date().toISOString(),
      kind: cloudSyncSnapshotKind,
      version: 1
    }
  };
}

function mergeCloudOperationSnapshots(
  documentSnapshot: CloudSyncSnapshot,
  snapshotRevision: number | null | undefined,
  operations: CloudOperation[],
  keyMaterial: CloudSyncKeyMaterial
): CloudSyncMergeResult & { appliedOperationCount: number } {
  let snapshot = documentSnapshot;
  let appliedOperationCount = 0;
  const orderedOperations = [...operations]
    .sort((left, right) => (left.revision ?? 0) - (right.revision ?? 0))
    .map((operation) => ({
      operation,
      snapshot: decryptCloudOperationSnapshot(operation, keyMaterial)
    }));
  const inferredSnapshotRevision = orderedOperations.reduce<number | undefined>(
    (latest, item) => {
      if (
        item.snapshot &&
        typeof item.operation.revision === "number" &&
        sameCloudSyncValue(item.snapshot.config, documentSnapshot.config)
      ) {
        return Math.max(latest ?? 0, item.operation.revision);
      }
      return latest;
    },
    undefined
  );
  const representedRevision = typeof snapshotRevision === "number"
    ? snapshotRevision
    : inferredSnapshotRevision;

  for (const item of orderedOperations) {
    if (
      representedRevision !== undefined &&
      typeof item.operation.revision === "number" &&
      item.operation.revision <= representedRevision
    ) {
      continue;
    }
    const operationSnapshot = item.snapshot;
    if (
      !operationSnapshot ||
      typeof item.operation.revision !== "number" ||
      item.operation.baseRevision !== item.operation.revision - 1
    ) {
      continue;
    }
    if (!sameCloudSyncValue(snapshot.config, operationSnapshot.config)) {
      appliedOperationCount += 1;
    }
    snapshot = operationSnapshot;
  }

  return {
    appliedOperationCount,
    conflictFields: [],
    conflicts: [],
    snapshot
  };
}

function resolveCloudDocumentSnapshot(
  document: CloudDocument,
  operations: CloudOperation[],
  keyMaterial: CloudSyncKeyMaterial
): CloudSyncMergeResult & { appliedOperationCount: number } {
  if (document.snapshotRevision === null) {
    return {
      appliedOperationCount: 0,
      conflictFields: [],
      conflicts: [],
      snapshot: replayCloudOperationLog(operations, keyMaterial)
    };
  }
  if (!document.encryptedSnapshot) {
    throw new Error("Cloud sync document does not contain an encrypted snapshot.");
  }
  return mergeCloudOperationSnapshots(
    decryptSnapshot(document.encryptedSnapshot, keyMaterial),
    document.snapshotRevision,
    operations,
    keyMaterial
  );
}

function replayCloudOperationLog(
  operations: CloudOperation[],
  keyMaterial: CloudSyncKeyMaterial
): CloudSyncSnapshot {
  let snapshot: CloudSyncSnapshot | undefined;
  let unsupportedAcceptedOperation = false;

  for (const operation of [...operations].sort(
    (left, right) => (left.revision ?? 0) - (right.revision ?? 0)
  )) {
    if (
      typeof operation.revision !== "number" ||
      operation.baseRevision !== operation.revision - 1
    ) {
      continue;
    }
    const operationSnapshot = decryptCloudOperationSnapshot(operation, keyMaterial);
    if (operationSnapshot) {
      snapshot = operationSnapshot;
      unsupportedAcceptedOperation = false;
    } else if (snapshot) {
      unsupportedAcceptedOperation = true;
    }
  }

  if (!snapshot || unsupportedAcceptedOperation) {
    throw new Error(
      "Cloud sync legacy snapshot cannot be restored because its operation log does not contain a complete supported snapshot."
    );
  }
  return snapshot;
}

function decryptCloudOperationSnapshot(
  operation: CloudOperation,
  keyMaterial: CloudSyncKeyMaterial
): CloudSyncSnapshot | undefined {
  if (!operation.encryptedPayload) {
    return undefined;
  }
  const payload = decryptJson(operation.encryptedPayload, keyMaterial);
  if (
    !isObject(payload) ||
    payload.kind !== "replace-cloud-sync-snapshot" ||
    payload.version !== 2 ||
    !isCloudSyncSnapshot(payload.snapshot)
  ) {
    return undefined;
  }
  return payload.snapshot;
}

function mergeCloudSyncValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  conflicts: string[],
  conflictPreference: CloudSyncConflictPreference,
  conflictFields: CloudSyncConflictField[],
  conflictResults?: CloudSyncConflictResultMap
): unknown | typeof missingCloudSyncMergeValue {
  if (sameCloudSyncValue(local, remote)) {
    return cloneCloudSyncMergeValue(local);
  }
  if (sameCloudSyncValue(local, base)) {
    return cloneCloudSyncMergeValue(remote);
  }
  if (sameCloudSyncValue(remote, base)) {
    return cloneCloudSyncMergeValue(local);
  }

  if (Array.isArray(local) && Array.isArray(remote) && (Array.isArray(base) || isMissingCloudSyncMergeValue(base))) {
    const primitiveMerge = mergePrimitiveCloudSyncArray(
      Array.isArray(base) ? base : [],
      local,
      remote
    );
    if (primitiveMerge) {
      return primitiveMerge;
    }

    const identifiedMerge = mergeIdentifiedCloudSyncArray(
      Array.isArray(base) ? base : [],
      local,
      remote,
      path,
      conflicts,
      conflictPreference,
      conflictFields,
      conflictResults
    );
    if (identifiedMerge) {
      return identifiedMerge;
    }

    return resolveCloudSyncMergeConflict({
      conflictFields,
      conflictPreference,
      conflictResults,
      conflicts,
      local,
      path,
      remote
    });
  }

  if (isObject(local) && isObject(remote) && (isObject(base) || isMissingCloudSyncMergeValue(base))) {
    return mergeCloudSyncObject(
      isObject(base) ? base : {},
      local,
      remote,
      path,
      conflicts,
      conflictPreference,
      conflictFields,
      conflictResults
    );
  }

  return resolveCloudSyncMergeConflict({
    conflictFields,
    conflictPreference,
    conflictResults,
    conflicts,
    local,
    path,
    remote
  });
}

function mergeCloudSyncObject(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  path: string,
  conflicts: string[],
  conflictPreference: CloudSyncConflictPreference,
  conflictFields: CloudSyncConflictField[],
  conflictResults?: CloudSyncConflictResultMap
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(remote),
    ...Object.keys(local)
  ]);

  for (const key of keys) {
    const merged = mergeCloudSyncValue(
      Object.hasOwn(base, key) ? base[key] : missingCloudSyncMergeValue,
      Object.hasOwn(local, key) ? local[key] : missingCloudSyncMergeValue,
      Object.hasOwn(remote, key) ? remote[key] : missingCloudSyncMergeValue,
      `${path}.${key}`,
      conflicts,
      conflictPreference,
      conflictFields,
      conflictResults
    );
    if (!isMissingCloudSyncMergeValue(merged) && merged !== undefined) {
      result[key] = merged;
    }
  }

  return result;
}

function resolveCloudSyncMergeConflict({
  conflictFields,
  conflictPreference,
  conflictResults,
  conflicts,
  local,
  path,
  remote
}: {
  conflictFields: CloudSyncConflictField[];
  conflictPreference: CloudSyncConflictPreference;
  conflictResults?: CloudSyncConflictResultMap;
  conflicts: string[];
  local: unknown;
  path: string;
  remote: unknown;
}): unknown | typeof missingCloudSyncMergeValue {
  conflicts.push(path);
  if (!conflictFields.some((field) => field.path === path)) {
    conflictFields.push({
      local: cloudSyncConflictValue(local),
      path,
      remote: cloudSyncConflictValue(remote)
    });
  }
  if (conflictResults?.has(path)) {
    return cloneCloudSyncMergeValue(conflictResults.get(path));
  }
  return cloneCloudSyncMergeValue(conflictPreference === "local" ? local : remote);
}

function mergeIdentifiedCloudSyncArray(
  base: unknown[],
  local: unknown[],
  remote: unknown[],
  path: string,
  conflicts: string[],
  conflictPreference: CloudSyncConflictPreference,
  conflictFields: CloudSyncConflictField[],
  conflictResults?: CloudSyncConflictResultMap
): unknown[] | undefined {
  const baseMap = toIdentifiedCloudSyncMap(base, path);
  const localMap = toIdentifiedCloudSyncMap(local, path);
  const remoteMap = toIdentifiedCloudSyncMap(remote, path);
  if (!baseMap || !localMap || !remoteMap) {
    return undefined;
  }

  const keys = uniqueStrings([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...baseMap.keys()
  ]);
  const result: unknown[] = [];
  for (const key of keys) {
    const merged = mergeCloudSyncValue(
      baseMap.has(key) ? baseMap.get(key) : missingCloudSyncMergeValue,
      localMap.has(key) ? localMap.get(key) : missingCloudSyncMergeValue,
      remoteMap.has(key) ? remoteMap.get(key) : missingCloudSyncMergeValue,
      `${path}[${key}]`,
      conflicts,
      conflictPreference,
      conflictFields,
      conflictResults
    );
    if (!isMissingCloudSyncMergeValue(merged) && merged !== undefined) {
      result.push(merged);
    }
  }

  return result;
}

function mergePrimitiveCloudSyncArray(base: unknown[], local: unknown[], remote: unknown[]): unknown[] | undefined {
  const baseMap = toPrimitiveCloudSyncMap(base);
  const localMap = toPrimitiveCloudSyncMap(local);
  const remoteMap = toPrimitiveCloudSyncMap(remote);
  if (!baseMap || !localMap || !remoteMap) {
    return undefined;
  }
  const baseKeys = [...baseMap.keys()];
  if (
    primitiveCloudSyncArrayReordered(baseKeys, [...localMap.keys()]) ||
    primitiveCloudSyncArrayReordered(baseKeys, [...remoteMap.keys()])
  ) {
    return undefined;
  }

  const keys = uniqueStrings([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...baseMap.keys()
  ]);
  const result: unknown[] = [];
  for (const key of keys) {
    const hasBase = baseMap.has(key);
    const hasLocal = localMap.has(key);
    const hasRemote = remoteMap.has(key);
    if (hasLocal && hasRemote) {
      result.push(cloneJson(localMap.get(key)));
    } else if (!hasBase && hasLocal) {
      result.push(cloneJson(localMap.get(key)));
    } else if (!hasBase && hasRemote) {
      result.push(cloneJson(remoteMap.get(key)));
    }
  }
  return result;
}

function primitiveCloudSyncArrayReordered(baseKeys: string[], nextKeys: string[]): boolean {
  const baseSet = new Set(baseKeys);
  const nextSet = new Set(nextKeys);
  const sharedBaseOrder = baseKeys.filter((key) => nextSet.has(key));
  const sharedNextOrder = nextKeys.filter((key) => baseSet.has(key));
  return !sameCloudSyncValue(sharedBaseOrder, sharedNextOrder);
}

function toIdentifiedCloudSyncMap(items: unknown[], path: string): Map<string, unknown> | undefined {
  const map = new Map<string, unknown>();
  for (const item of items) {
    const key = cloudSyncArrayIdentity(path, item);
    if (!key || map.has(key)) {
      return undefined;
    }
    map.set(key, item);
  }
  return map;
}

function toPrimitiveCloudSyncMap(items: unknown[]): Map<string, unknown> | undefined {
  const map = new Map<string, unknown>();
  for (const item of items) {
    if (!isCloudSyncPrimitive(item)) {
      return undefined;
    }
    const key = stableStringify(item);
    if (map.has(key)) {
      return undefined;
    }
    map.set(key, item);
  }
  return map;
}

function cloudSyncArrayIdentity(path: string, value: unknown): string | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const segment = path.split(".").at(-1) || path;
  const candidatesBySegment: Record<string, string[]> = {
    Providers: ["id", "name"],
    botConfigs: ["id", "name"],
    capabilities: ["id", "type", "protocol"],
    mcpServers: ["name", "id"],
    plugins: ["id", "name"],
    profiles: ["id", "name"],
    providerPlugins: ["id", "name", "provider"],
    routes: ["id", "name"],
    rules: ["id", "name"],
    virtualModelProfiles: ["id", "name", "key", "model"]
  };
  const candidates = candidatesBySegment[segment];
  if (!candidates) {
    return undefined;
  }

  for (const candidate of candidates) {
    const item = value[candidate];
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }
  return undefined;
}

function isCloudSyncPrimitive(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function sameCloudSyncValue(left: unknown, right: unknown): boolean {
  if (isMissingCloudSyncMergeValue(left) || isMissingCloudSyncMergeValue(right)) {
    return isMissingCloudSyncMergeValue(left) && isMissingCloudSyncMergeValue(right);
  }
  return stableStringify(left) === stableStringify(right);
}

function cloneCloudSyncMergeValue(value: unknown): unknown | typeof missingCloudSyncMergeValue {
  return isMissingCloudSyncMergeValue(value) ? missingCloudSyncMergeValue : cloneJson(value);
}

function cloudSyncConflictValue(value: unknown): CloudSyncConflictField["local"] {
  return isMissingCloudSyncMergeValue(value)
    ? { exists: false }
    : { exists: true, value: cloneJson(value) };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function encryptCloudSyncSnapshotForTest(
  snapshot: CloudSyncSnapshot,
  password: string,
  salt = randomBase64(16)
): { encrypted: EncryptedPayload; keyId: string; keySalt: string } {
  const cloudSync = normalizedCloudSyncConfig({
    baseUrl: "http://localhost:3000",
    deviceName: "test",
    enabled: true,
    keySalt: salt,
    lastRevision: 0,
    namespace: "ccr"
  });
  const keyMaterial = resolveCloudSyncKey(cloudSync, { password }, { allowCreateSalt: false });
  return {
    encrypted: encryptJson(snapshot, keyMaterial),
    keyId: keyMaterial.keyId,
    keySalt: keyMaterial.keySalt
  };
}

export function decryptCloudSyncSnapshotForTest(
  encrypted: EncryptedPayload,
  password: string,
  keySalt: string
): CloudSyncSnapshot {
  const cloudSync = normalizedCloudSyncConfig({
    baseUrl: "http://localhost:3000",
    deviceName: "test",
    enabled: true,
    keySalt,
    lastRevision: 0,
    namespace: "ccr"
  });
  const keyMaterial = resolveCloudSyncKey(cloudSync, { password }, { allowCreateSalt: false });
  return decryptSnapshot(encrypted, keyMaterial);
}

export function encryptCloudSyncOperationForTest(
  snapshot: CloudSyncSnapshot,
  password: string,
  keySalt: string
): EncryptedPayload {
  const cloudSync = normalizedCloudSyncConfig({
    baseUrl: "http://localhost:3000",
    deviceName: "test",
    enabled: true,
    keySalt,
    lastRevision: 0,
    namespace: "ccr"
  });
  const keyMaterial = resolveCloudSyncKey(cloudSync, { password }, { allowCreateSalt: false });
  return encryptJson({
    kind: "replace-cloud-sync-snapshot",
    snapshot,
    snapshotHash: snapshotHash(snapshot),
    snapshotVersion: snapshot.version,
    updatedAt: snapshot.exportedAt,
    version: 2
  } satisfies CloudSyncSnapshotOperation, keyMaterial);
}

export function mergeCloudSyncSnapshotsForTest(
  base: CloudSyncSnapshot,
  local: CloudSyncSnapshot,
  remote: CloudSyncSnapshot
): CloudSyncMergeResult {
  return mergeCloudSyncSnapshots(base, local, remote);
}

async function pushCloudSyncConfigInternal(
  config: AppConfig,
  request: CloudSyncPushRequest,
  options: CloudSyncPushOptions
): Promise<CloudSyncOperationResult> {
  let readyConfig = requireCloudSyncEnabled(config);
  let keyMaterial = options.keyMaterial ?? resolveCloudSyncKey(readyConfig.cloudSync, request, { allowCreateSalt: false });
  if (
    keyMaterial.keyId !== readyConfig.cloudSync.keyId ||
    keyMaterial.keySalt !== readyConfig.cloudSync.keySalt ||
    keyMaterial.keyMode !== readyConfig.cloudSync.keyMode
  ) {
    readyConfig = {
      ...readyConfig,
      cloudSync: {
        ...readyConfig.cloudSync,
        keyId: keyMaterial.keyId,
        keyMode: keyMaterial.keyMode,
        keySalt: keyMaterial.keySalt
      }
    };
  }

  let baseRevision = readyConfig.cloudSync.lastRevision;
  if (request.force) {
    const remote = await pullCloudDocument(readyConfig, 0);
    readyConfig = remote.config;
    baseRevision = remote.data.document.revision;
    keyMaterial = options.keyMaterial ?? keyMaterial;
  }

  const snapshot = createCloudSyncSnapshot(readyConfig);
  const encryptedSnapshot = encryptJson(snapshot, keyMaterial);
  const encryptedOperation = encryptJson({
    kind: "replace-cloud-sync-snapshot",
    snapshot,
    snapshotHash: snapshotHash(snapshot),
    snapshotVersion: snapshot.version,
    updatedAt: snapshot.exportedAt,
    version: 2
  } satisfies CloudSyncSnapshotOperation, keyMaterial);
  const response = await cloudRequest<CloudPushResponse>(readyConfig, "/sync/push", {
    body: {
      baseRevision,
      clientOperationId: `${deviceOperationPrefix(readyConfig)}-${randomUUID()}`,
      deviceId: readyConfig.cloudSync.deviceId,
      encryptedOperation,
      encryptedSnapshot,
      namespace: readyConfig.cloudSync.namespace,
      snapshotHash: snapshotHash(snapshot)
    },
    method: "POST"
  });

  const document = response.data.document;
  const remoteRevision = document?.revision ?? baseRevision;
  if (
    response.data.conflict ||
    response.data.mergeRequired ||
    response.data.snapshotAccepted === false ||
    response.data.snapshotRejectedReason
  ) {
    if (!request.force && options.mergeOnConflict !== false) {
      return mergeAndPushCloudSyncConflict({
        keyMaterial,
        localSnapshot: snapshot,
        missingOperations: response.data.missingOperations ?? [],
        missingOperationsExcludeOperationId: response.data.missingOperationsExcludeOperationId,
        missingOperationsHasMore: response.data.missingOperationsHasMore === true,
        nextMissingRevision: response.data.nextMissingRevision,
        remoteDocument: document,
        remoteRevision,
        responseConfig: response.config
      });
    }

    const nextConfig = {
      ...response.config,
      cloudSync: {
        ...response.config.cloudSync,
        lastSyncError: "Cloud has a newer encrypted snapshot. Pull first or force push to replace it."
      }
    };
    return {
      config: nextConfig,
      conflict: true,
      message: nextConfig.cloudSync.lastSyncError || "Cloud sync conflict.",
      mergeApplied: false,
      mergeConflicts: [],
      remoteRevision,
      snapshotPushed: false,
      status: getCloudSyncStatus(nextConfig)
    };
  }
  if (response.data.accepted === false) {
    throw new Error("Cloud sync server did not accept the encrypted operation.");
  }

  const nextConfig = withCloudSyncSuccess(response.config, {
    lastRevision: remoteRevision,
    snapshotHash: document?.snapshotHash || snapshotHash(snapshot)
  }, snapshot);

  return {
    config: nextConfig,
    message: options.setupMessage
      ? "Cloud sync is enabled and the local encrypted snapshot was uploaded."
      : "Local configuration was encrypted and pushed to cloud sync.",
    remoteRevision,
    snapshotPushed: true,
    status: getCloudSyncStatus(nextConfig)
  };
}

async function mergeAndPushCloudSyncConflict({
  keyMaterial,
  localSnapshot,
  missingOperations,
  missingOperationsExcludeOperationId,
  missingOperationsHasMore,
  nextMissingRevision,
  remoteDocument,
  remoteRevision,
  responseConfig
}: {
  keyMaterial: CloudSyncKeyMaterial;
  localSnapshot: CloudSyncSnapshot;
  missingOperations: CloudOperation[];
  missingOperationsExcludeOperationId?: string;
  missingOperationsHasMore: boolean;
  nextMissingRevision?: number | null;
  remoteDocument?: CloudDocument;
  remoteRevision: number;
  responseConfig: AppConfig;
}): Promise<CloudSyncOperationResult> {
  let operationCollection: CloudOperationCollection;
  if (remoteDocument?.encryptedSnapshot && remoteDocument.snapshotRevision === null) {
    const fullHistory = await pullAllCloudDocuments(responseConfig, 0);
    operationCollection = {
      config: fullHistory.config,
      document: fullHistory.data.document,
      operations: fullHistory.data.operations ?? []
    };
  } else {
    operationCollection = await continueCloudOperationPages({
      config: responseConfig,
      document: remoteDocument,
      excludeOperationId: missingOperationsExcludeOperationId,
      hasMore: missingOperationsHasMore,
      nextRevision: nextMissingRevision,
      operations: missingOperations
    });
  }
  responseConfig = operationCollection.config;
  remoteDocument = operationCollection.document;
  remoteRevision = remoteDocument?.revision ?? remoteRevision;

  if (!remoteDocument?.encryptedSnapshot) {
    return cloudSyncConflictResult(
      responseConfig,
      "Cloud has a newer encrypted snapshot, but it could not be loaded for automatic merge.",
      remoteRevision
    );
  }

  const baseSnapshot = cloudSyncSnapshotFromUnknown(responseConfig.cloudSync.lastSyncedSnapshot);
  let remoteSnapshot: CloudSyncSnapshot;
  let remoteMergeConflicts: string[] = [];
  try {
    const remoteMerge = resolveCloudDocumentSnapshot(
      remoteDocument,
      operationCollection.operations,
      keyMaterial
    );
    remoteSnapshot = remoteMerge.snapshot;
    remoteMergeConflicts = remoteMerge.conflicts;
  } catch (error) {
    return cloudSyncConflictResult(
      responseConfig,
      `Cloud has a newer encrypted snapshot, but it could not be decrypted for automatic merge: ${formatError(error)}`,
      remoteRevision
    );
  }
  if (!baseSnapshot) {
    return cloudSyncResolutionRequiredResult({
      config: responseConfig,
      keyMaterial,
      localSnapshot,
      paths: ["config"],
      remoteRevision,
      remoteSnapshot,
      remoteSnapshotHash: remoteDocument.snapshotHash || snapshotHash(remoteSnapshot)
    });
  }

  const merge = mergeCloudSyncSnapshots(baseSnapshot, localSnapshot, remoteSnapshot);
  const mergeConflicts = uniqueStrings([
    ...remoteMergeConflicts,
    ...merge.conflicts
  ]);
  if (mergeConflicts.length > 0) {
    return cloudSyncResolutionRequiredResult({
      baseSnapshot,
      config: responseConfig,
      keyMaterial,
      localSnapshot,
      paths: mergeConflicts,
      remoteRevision,
      remoteSnapshot,
      remoteSnapshotHash: remoteDocument.snapshotHash || snapshotHash(remoteSnapshot)
    });
  }
  let mergedConfig = applyCloudSyncSnapshot(responseConfig, merge.snapshot);
  mergedConfig = {
    ...mergedConfig,
    cloudSync: {
      ...normalizedCloudSyncConfig(mergedConfig.cloudSync),
      lastRevision: remoteDocument.revision,
      lastSyncError: undefined,
      lastSyncedSnapshot: cloneJson(remoteSnapshot),
      snapshotHash: remoteDocument.snapshotHash || snapshotHash(remoteSnapshot)
    }
  };

  const pushed = await pushCloudSyncConfigInternal(mergedConfig, {}, {
    keyMaterial,
    mergeOnConflict: false
  });

  return {
    ...pushed,
    conflict: true,
    mergeApplied: pushed.snapshotPushed === true,
    mergeConflicts,
    message: pushed.snapshotPushed
      ? "Cloud sync conflict was automatically merged and pushed."
      : pushed.message
  };
}

function cloudSyncResolutionRequiredResult({
  baseSnapshot,
  config,
  keyMaterial,
  localSnapshot,
  paths,
  remoteRevision,
  remoteSnapshot,
  remoteSnapshotHash
}: {
  baseSnapshot?: CloudSyncSnapshot;
  config: AppConfig;
  keyMaterial: CloudSyncKeyMaterial;
  localSnapshot: CloudSyncSnapshot;
  paths: string[];
  remoteRevision: number;
  remoteSnapshot: CloudSyncSnapshot;
  remoteSnapshotHash?: string;
}): CloudSyncOperationResult {
  const identity = cloudSyncConflictIdentity(config);
  const previousId = pendingCloudSyncConflictIds.get(identity);
  if (previousId) {
    removePendingCloudSyncConflict(previousId);
  }

  const id = randomUUID();
  const expiresAt = Date.now() + cloudSyncConflictResolutionMs;
  const normalizedPaths = uniqueStrings(paths);
  const descriptor: CloudSyncConflictResolution = {
    expiresAt: new Date(expiresAt).toISOString(),
    fields: describeCloudSyncConflictFields(
      baseSnapshot,
      localSnapshot,
      remoteSnapshot,
      normalizedPaths
    ),
    id,
    paths: normalizedPaths,
    remoteRevision
  };
  const pending: PendingCloudSyncConflict = {
    baseSnapshot: baseSnapshot ? cloneJson(baseSnapshot) : undefined,
    descriptor,
    identity,
    keyMaterial,
    localSnapshot: cloneJson(localSnapshot),
    remoteSnapshot: cloneJson(remoteSnapshot),
    remoteSnapshotHash
  };
  pendingCloudSyncConflicts.set(id, pending);
  pendingCloudSyncConflictIds.set(identity, id);
  setTimeout(() => {
    if (pendingCloudSyncConflicts.get(id) === pending) {
      removePendingCloudSyncConflict(id);
    }
  }, cloudSyncConflictResolutionMs).unref();

  const message = "Cloud sync found conflicting changes that require your confirmation.";
  const nextConfig = {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      lastSyncError: message
    }
  };
  return {
    config: nextConfig,
    conflict: true,
    conflictResolution: descriptor,
    mergeApplied: false,
    mergeConflicts: descriptor.paths,
    message,
    remoteRevision,
    snapshotApplied: false,
    snapshotPushed: false,
    status: getCloudSyncStatus(nextConfig)
  };
}

function describeCloudSyncConflictFields(
  baseSnapshot: CloudSyncSnapshot | undefined,
  localSnapshot: CloudSyncSnapshot,
  remoteSnapshot: CloudSyncSnapshot,
  paths: string[]
): CloudSyncConflictField[] {
  if (!baseSnapshot) {
    if (paths.length !== 1 || paths[0] !== "config") {
      throw new Error("Cloud sync cannot describe a conflict without a shared base snapshot.");
    }
    return [{
      local: cloudSyncConflictValue(localSnapshot.config),
      path: "config",
      remote: cloudSyncConflictValue(remoteSnapshot.config)
    }];
  }

  const byPath = new Map(
    mergeCloudSyncSnapshots(baseSnapshot, localSnapshot, remoteSnapshot)
      .conflictFields
      .map((field) => [field.path, field])
  );
  return paths.map((path) => {
    const field = byPath.get(path);
    if (!field) {
      throw new Error(`Cloud sync could not describe conflicting path: ${path}`);
    }
    return field;
  });
}

function pendingCloudSyncConflictForConfig(config: AppConfig): PendingCloudSyncConflict | undefined {
  const id = pendingCloudSyncConflictIds.get(cloudSyncConflictIdentity(config));
  return id ? pendingCloudSyncConflictById(id) : undefined;
}

function pendingCloudSyncConflictById(id: string): PendingCloudSyncConflict | undefined {
  const pending = pendingCloudSyncConflicts.get(id);
  if (!pending) {
    return undefined;
  }
  if (Date.parse(pending.descriptor.expiresAt) <= Date.now()) {
    removePendingCloudSyncConflict(id);
    return undefined;
  }
  return pending;
}

function clearPendingCloudSyncConflict(config: AppConfig): void {
  const id = pendingCloudSyncConflictIds.get(cloudSyncConflictIdentity(config));
  if (id) {
    removePendingCloudSyncConflict(id);
  }
}

function removePendingCloudSyncConflict(id: string): void {
  const pending = pendingCloudSyncConflicts.get(id);
  pendingCloudSyncConflicts.delete(id);
  if (pending && pendingCloudSyncConflictIds.get(pending.identity) === id) {
    pendingCloudSyncConflictIds.delete(pending.identity);
  }
}

function cloudSyncConflictIdentity(config: AppConfig): string {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  return [
    cloudSync.baseUrl,
    cloudSync.namespace,
    cloudSync.userId || "",
    cloudSync.deviceId || "",
    cloudSync.keyId || ""
  ].join("\u0000");
}

function cloudSyncConflictResult(
  config: AppConfig,
  message: string,
  remoteRevision: number,
  mergeConflicts: string[] = []
): CloudSyncOperationResult {
  const nextConfig = {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      lastSyncError: message
    }
  };

  return {
    config: nextConfig,
    conflict: true,
    mergeApplied: false,
    mergeConflicts,
    message,
    remoteRevision,
    snapshotPushed: false,
    status: getCloudSyncStatus(nextConfig)
  };
}

async function withCloudSyncOperationAuthHandling(
  operation: () => Promise<CloudSyncOperationResult>
): Promise<CloudSyncOperationResult> {
  try {
    return await operation();
  } catch (error) {
    if (!isCloudSyncAuthExpiredError(error)) {
      throw error;
    }
    return {
      authExpired: true,
      config: error.config,
      message: error.message,
      snapshotApplied: false,
      snapshotPushed: false,
      status: getCloudSyncStatus(error.config)
    };
  }
}

function isCloudSyncAuthExpiredError(error: unknown): error is CloudSyncAuthExpiredError {
  return error instanceof CloudSyncAuthExpiredError;
}

function cloudSyncLoggedOutConfig(config: AppConfig): AppConfig {
  const nextConfig = disableCloudSyncConfig(config);
  return {
    ...nextConfig,
    cloudSync: {
      ...normalizedCloudSyncConfig(nextConfig.cloudSync),
      lastSyncError: cloudSyncAuthExpiredMessage
    }
  };
}

async function pullAllCloudDocuments(
  config: AppConfig,
  sinceRevision: number,
  excludeOperationId?: string
): Promise<{ config: AppConfig; data: CloudPullResponse }> {
  const firstPage = await pullCloudDocument(config, sinceRevision, {
    excludeOperationId
  });
  const collection = await continueCloudOperationPages({
    config: firstPage.config,
    document: firstPage.data.document,
    excludeOperationId,
    hasMore: firstPage.data.pagination?.hasMore === true,
    nextRevision: firstPage.data.pagination?.nextRevision,
    operations: firstPage.data.operations ?? []
  });
  return {
    config: collection.config,
    data: {
      document: collection.document ?? firstPage.data.document,
      operations: collection.operations,
      pagination: {
        excludeOperationId: excludeOperationId ?? null,
        hasMore: false,
        limit: firstPage.data.pagination?.limit ?? 100,
        nextRevision: null
      }
    }
  };
}

async function continueCloudOperationPages({
  config,
  document,
  excludeOperationId,
  hasMore,
  nextRevision,
  operations
}: {
  config: AppConfig;
  document?: CloudDocument;
  excludeOperationId?: string;
  hasMore: boolean;
  nextRevision?: number | null;
  operations: CloudOperation[];
}): Promise<CloudOperationCollection> {
  let nextConfig = config;
  let nextDocument = document;
  let cursor = nextRevision;
  let more = hasMore;
  const collected = [...operations];
  const seenCursors = new Set<number>();

  while (more) {
    if (
      typeof cursor !== "number" ||
      !Number.isInteger(cursor) ||
      cursor < 0 ||
      seenCursors.has(cursor)
    ) {
      throw new Error("Cloud sync operation pagination did not provide a valid next revision.");
    }
    seenCursors.add(cursor);
    const page = await pullCloudDocument(nextConfig, cursor, {
      excludeOperationId
    });
    nextConfig = page.config;
    nextDocument = page.data.document;
    collected.push(...(page.data.operations ?? []));
    more = page.data.pagination?.hasMore === true;
    cursor = page.data.pagination?.nextRevision;
  }

  return {
    config: nextConfig,
    document: nextDocument,
    operations: collected
  };
}

async function pullCloudDocument(
  config: AppConfig,
  sinceRevision: number,
  options: { excludeOperationId?: string; limit?: number } = {}
): Promise<{ config: AppConfig; data: CloudPullResponse }> {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const search = new URLSearchParams({
    limit: String(options.limit ?? 100),
    namespace: cloudSync.namespace,
    sinceRevision: String(Math.max(0, Math.floor(sinceRevision)))
  });
  if (options.excludeOperationId) {
    search.set("excludeOperationId", options.excludeOperationId);
  }
  return cloudRequest<CloudPullResponse>(config, `/sync/pull?${search.toString()}`);
}

async function cloudRequest<T>(
  config: AppConfig,
  path: string,
  options: CloudRequestOptions = {},
  retry = true
): Promise<{ config: AppConfig; data: T }> {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const url = cloudSyncUrl(cloudSync.baseUrl, path);
  const response = await fetch(url, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cloudSync.accessToken ? { Authorization: `Bearer ${cloudSync.accessToken}` } : {})
    },
    method: options.method ?? "GET"
  });

  if (response.status === 401 && retry && cloudSync.refreshToken) {
    const refreshed = await refreshCloudTokens(config);
    return cloudRequest<T>(refreshed, path, options, false);
  }
  if (response.status === 401) {
    throw new CloudSyncAuthExpiredError(cloudSyncLoggedOutConfig(config));
  }

  const data = await readCloudResponse(response);
  if (!response.ok) {
    throw new Error(`Cloud sync request failed (${response.status}): ${cloudErrorMessage(data)}`);
  }

  return {
    config,
    data: data as T
  };
}

async function refreshCloudTokens(config: AppConfig): Promise<AppConfig> {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const refreshToken = requiredString(cloudSync.refreshToken, "Cloud refresh token");
  try {
    return applyCloudTokenRefreshPatch(config, await cloudTokenRefreshPatch(cloudSync, refreshToken));
  } catch (error) {
    if (error instanceof CloudSyncRefreshTokenExpiredError) {
      throw new CloudSyncAuthExpiredError(cloudSyncLoggedOutConfig(config));
    }
    throw error;
  }
}

async function cloudTokenRefreshPatch(
  cloudSync: CloudSyncConfig,
  refreshToken: string
): Promise<CloudTokenRefreshPatch> {
  const recent = cloudTokenRefreshRecent.get(refreshToken);
  if (recent) {
    if (recent.expiresAt > Date.now()) {
      return recent.patch;
    }
    cloudTokenRefreshRecent.delete(refreshToken);
  }

  const inFlight = cloudTokenRefreshInFlight.get(refreshToken);
  if (inFlight) {
    return inFlight;
  }

  const refresh = fetchCloudTokenRefreshPatch(cloudSync, refreshToken)
    .then((patch) => {
      rememberCloudTokenRefreshPatch(refreshToken, patch);
      return patch;
    })
    .finally(() => {
      cloudTokenRefreshInFlight.delete(refreshToken);
    });
  cloudTokenRefreshInFlight.set(refreshToken, refresh);
  return refresh;
}

async function fetchCloudTokenRefreshPatch(
  cloudSync: CloudSyncConfig,
  refreshToken: string
): Promise<CloudTokenRefreshPatch> {
  const response = await fetch(cloudSyncUrl(cloudSync.baseUrl, "/auth/refresh"), {
    body: JSON.stringify({ refreshToken }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const data = await readCloudResponse(response);
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) {
      throw new CloudSyncRefreshTokenExpiredError();
    }
    throw new Error(`Cloud token refresh failed (${response.status}): ${cloudErrorMessage(data)}`);
  }

  const tokenResponse = data as CloudTokenResponse;
  const accessToken = requiredString(tokenResponse.accessToken, "Cloud access token");
  const nextRefreshToken = optionalString(tokenResponse.refreshToken) || refreshToken;

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: optionalString(tokenResponse.refreshTokenExpiresAt)
  };
}

function rememberCloudTokenRefreshPatch(refreshToken: string, patch: CloudTokenRefreshPatch): void {
  const entry = {
    expiresAt: Date.now() + cloudTokenRefreshRecentMs,
    patch
  };
  cloudTokenRefreshRecent.set(refreshToken, entry);
  if (patch.refreshToken !== refreshToken) {
    cloudTokenRefreshRecent.set(patch.refreshToken, entry);
  }
}

function applyCloudTokenRefreshPatch(config: AppConfig, patch: CloudTokenRefreshPatch): AppConfig {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  return {
    ...config,
    cloudSync: {
      ...cloudSync,
      accessToken: patch.accessToken,
      refreshToken: patch.refreshToken,
      refreshTokenExpiresAt: patch.refreshTokenExpiresAt || cloudSync.refreshTokenExpiresAt
    }
  };
}

async function readCloudResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function cloudErrorMessage(data: unknown): string {
  if (isObject(data)) {
    const message = data.message;
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === "string").join("; ") || "unknown error";
    }
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  }
  return "unknown error";
}

function requireCloudSyncEnabled(config: AppConfig): AppConfig {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  if (!cloudSync.enabled) {
    throw new Error("Cloud sync is not enabled.");
  }
  if (!cloudSync.baseUrl) {
    throw new Error("Cloud sync server URL is required.");
  }
  if (!cloudSync.accessToken) {
    throw new Error("Cloud access token is required.");
  }
  if (!cloudSync.keyId || !cloudSync.keySalt) {
    throw new Error("Set up an end-to-end encryption password or key file before using cloud sync.");
  }

  return {
    ...config,
    cloudSync
  };
}

function resolveCloudSyncKey(
  cloudSync: CloudSyncConfig,
  input: CloudSyncKeyInput,
  options: { allowCreateSalt: boolean }
): CloudSyncKeyMaterial {
  const cachedKeyId = cloudSync.keyId;
  const cached = cachedKeyId ? cloudSyncKeyCache.get(cachedKeyId) : undefined;
  if (cachedKeyId && cached && !input.password && !input.keyFilePath) {
    return {
      key: cached,
      keyId: cachedKeyId,
      keyMode: cloudSync.keyMode ?? "password",
      keySalt: requiredString(cloudSync.keySalt, "Cloud sync key salt")
    };
  }

  const secret = readSecretInput(input);
  const keyMode: CloudSyncConfig["keyMode"] = input.keyFilePath ? "key-file" : "password";
  const keySalt = cloudSync.keySalt || (options.allowCreateSalt ? randomBase64(16) : "");
  if (!keySalt) {
    throw new Error("Cloud sync key salt is missing. Run cloud sync setup again.");
  }
  const salt = Buffer.from(keySalt, "base64");
  if (salt.length < 16) {
    throw new Error("Cloud sync key salt is invalid.");
  }

  const key = pbkdf2Sync(secret, salt, keyDerivationIterations, 32, "sha256");
  const keyId = cloudSyncKeyId(key, salt);
  if (cloudSync.keyId && keyId !== cloudSync.keyId) {
    throw new Error("The cloud sync password or key file does not match this device's encryption key.");
  }
  cloudSyncKeyCache.set(keyId, key);

  return {
    key,
    keyId,
    keyMode,
    keySalt
  };
}

function readSecretInput(input: CloudSyncKeyInput): Buffer {
  if (input.keyFilePath) {
    return readCloudSyncKeyFile(input.keyFilePath);
  }
  if (typeof input.password === "string" && input.password.length > 0) {
    return Buffer.from(input.password, "utf8");
  }
  throw new Error("Enter a cloud sync password or choose a key file.");
}

function readCloudSyncKeyFile(file: string): Buffer {
  if (!existsSync(file)) {
    throw new Error("Cloud sync key file does not exist. Generate a key file first, or choose an existing one.");
  }

  const content = readFileSync(file, "utf8").trim();
  if (!content) {
    throw new Error("Cloud sync key file is empty.");
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isObject(parsed) && parsed.kind === keyFileKind && parsed.version === keyFileVersion && typeof parsed.key === "string") {
      return Buffer.from(parsed.key, "base64");
    }
  } catch {
    return Buffer.from(content, "utf8");
  }
  return Buffer.from(content, "utf8");
}

function writeCloudSyncKeyFile(file: string): void {
  const key = randomBytes(32).toString("base64");
  mkdirSync(dirname(file), { mode: privateDirMode, recursive: true });
  writeFileSync(file, `${JSON.stringify({ kind: keyFileKind, key, version: keyFileVersion }, null, 2)}\n`, {
    encoding: "utf8",
    mode: privateFileMode
  });
  chmodSync(file, privateFileMode);
}

function encryptJson(value: unknown, keyMaterial: CloudSyncKeyMaterial): EncryptedPayload {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial.key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(stableStringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: "aes-256-gcm",
    ciphertext: ciphertext.toString("base64"),
    encoding: "base64",
    keyId: keyMaterial.keyId,
    metadata: {
      kdf: "pbkdf2-sha256",
      kdfIterations: keyDerivationIterations,
      keySalt: keyMaterial.keySalt,
      snapshotVersion: isObject(value) && typeof value.version === "number" ? value.version : undefined
    },
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64")
  };
}

function decryptSnapshot(encrypted: EncryptedPayload, keyMaterial: CloudSyncKeyMaterial): CloudSyncSnapshot {
  const parsed = decryptJson(encrypted, keyMaterial);
  if (!isCloudSyncSnapshot(parsed)) {
    throw new Error("Remote cloud sync snapshot has an unsupported format.");
  }
  return parsed;
}

function decryptJson(encrypted: EncryptedPayload, keyMaterial: CloudSyncKeyMaterial): unknown {
  if (encrypted.algorithm !== "aes-256-gcm") {
    throw new Error(`Unsupported cloud sync encryption algorithm: ${encrypted.algorithm}`);
  }
  if (encrypted.keyId && encrypted.keyId !== keyMaterial.keyId) {
    throw new Error("The cloud sync password or key file does not match the remote encrypted snapshot.");
  }
  const nonce = Buffer.from(encrypted.nonce, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial.key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
}

function keySaltFromEncryptedPayload(encrypted: EncryptedPayload): string {
  const keySalt = optionalString(encrypted.metadata?.keySalt);
  if (!keySalt) {
    throw new Error("Remote cloud sync snapshot does not include key derivation metadata.");
  }
  return keySalt;
}

function isCloudSyncSnapshot(value: unknown): value is CloudSyncSnapshot {
  return isObject(value) &&
    value.kind === cloudSyncSnapshotKind &&
    value.version === 1 &&
    isObject(value.config);
}

function cloudSyncSnapshotFromUnknown(value: unknown): CloudSyncSnapshot | undefined {
  return isCloudSyncSnapshot(value) ? cloneJson(value) : undefined;
}

function isMissingCloudSyncMergeValue(value: unknown): value is typeof missingCloudSyncMergeValue {
  return value === missingCloudSyncMergeValue;
}

function snapshotHash(snapshot: CloudSyncSnapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("base64url");
}

function cloudSyncKeyId(key: Buffer, salt: Buffer): string {
  return `ccr-e2ee-v1-${createHash("sha256").update(salt).update(key).digest("base64url").slice(0, 32)}`;
}

function withCloudSyncSuccess(
  config: AppConfig,
  patch: Pick<CloudSyncConfig, "lastRevision"> & Partial<Pick<CloudSyncConfig, "snapshotHash">>,
  syncedSnapshot?: CloudSyncSnapshot
): AppConfig {
  clearPendingCloudSyncConflict(config);
  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      lastRevision: patch.lastRevision,
      lastSyncedSnapshot: syncedSnapshot ? cloneJson(syncedSnapshot) : normalizedCloudSyncConfig(config.cloudSync).lastSyncedSnapshot,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined,
      snapshotHash: patch.snapshotHash
    }
  };
}

function withCloudSyncUserProfile(config: AppConfig, user: CloudUserResponse): AppConfig {
  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      ...cloudSyncUserProfilePatch(user)
    }
  };
}

function cloudSyncUserProfilePatch(
  user: CloudUserResponse | CloudSyncAuthTokenInput
): Partial<CloudSyncConfig> {
  const id = optionalString("accessToken" in user ? user.userId : user.id);
  const login = optionalString("accessToken" in user ? user.userLogin : user.githubLogin);
  const name = optionalString("accessToken" in user ? user.userName : user.githubName);
  const avatarUrl = optionalString("accessToken" in user ? user.userAvatarUrl : user.avatarUrl);
  const email = optionalString("accessToken" in user ? user.userEmail : user.email);

  return {
    ...(avatarUrl ? { userAvatarUrl: avatarUrl } : {}),
    ...(email ? { userEmail: email } : {}),
    ...(id ? { userId: id } : {}),
    ...(login ? { userLogin: login } : {}),
    ...(name ? { userName: name } : {})
  };
}

function prepareCloudSyncAuthConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      baseUrl: CLOUD_SYNC_DEFAULT_BASE_URL,
      deviceName: normalizedCloudSyncConfig(config.cloudSync).deviceName || defaultDeviceName(),
      lastSyncError: undefined
    }
  };
}

function normalizedCloudSyncConfig(config: CloudSyncConfig): CloudSyncConfig {
  return {
    ...config,
    baseUrl: CLOUD_SYNC_DEFAULT_BASE_URL,
    deviceName: optionalString(config.deviceName) || defaultDeviceName(),
    enabled: Boolean(config.enabled),
    lastRevision: Number.isInteger(config.lastRevision) && config.lastRevision >= 0 ? config.lastRevision : 0,
    lastSyncedSnapshot: cloudSyncSnapshotFromUnknown(config.lastSyncedSnapshot),
    namespace: optionalString(config.namespace) || defaultCloudSyncNamespace
  };
}

function normalizeBaseUrl(value: string | undefined): string {
  const raw = requiredString(value, "Cloud sync server URL");
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Cloud sync server URL must use http or https.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function cloudSyncUrl(baseUrl: string, path: string): string {
  return new URL(path, `${normalizeBaseUrl(baseUrl)}/`).toString();
}

function cloudSyncLoginUrl(callbackUrl: string | undefined): string {
  const url = new URL(cloudSyncUrl(CLOUD_SYNC_DEFAULT_BASE_URL, "/auth/github/login"));
  const normalizedCallbackUrl = optionalString(callbackUrl);
  if (normalizedCallbackUrl) {
    const verifier = randomBytes(64).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const callbackKey = cloudSyncAuthCallbackKey(new URL(normalizedCallbackUrl));
    const pending = {
      expiresAt: Date.now() + cloudSyncAuthAttemptMs,
      verifier
    };
    pendingCloudSyncAuth.set(callbackKey, pending);
    setTimeout(() => {
      if (pendingCloudSyncAuth.get(callbackKey) === pending) {
        pendingCloudSyncAuth.delete(callbackKey);
      }
    }, cloudSyncAuthAttemptMs).unref();
    url.searchParams.set("redirect_uri", normalizedCallbackUrl);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

function cloudSyncAuthCallbackKey(callbackUrl: URL): string {
  const session = optionalString(callbackUrl.searchParams.get("session"));
  if (session) {
    return `session:${session}`;
  }
  const normalized = new URL(callbackUrl);
  normalized.searchParams.delete("code");
  normalized.searchParams.delete("expires_at");
  return normalized.toString();
}

function deviceOperationPrefix(config: AppConfig): string {
  return (config.cloudSync.deviceId || "local").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 48) || "local";
}

function defaultDeviceName(): string {
  return hostname().trim() || `${process.platform}-${process.arch}`;
}

function requiredString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function randomBase64(size: number): string {
  return randomBytes(size).toString("base64");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value)) ?? "undefined";
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!isObject(value)) {
    return value;
  }
  return Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    const item = value[key];
    if (item !== undefined) {
      result[key] = sortJson(item);
    }
    return result;
  }, {});
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
