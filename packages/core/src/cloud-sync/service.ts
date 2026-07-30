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
  CloudSyncRotateKeyRequest,
  CloudSyncScope,
  CloudSyncSetupRequest,
  CloudSyncStatus
} from "@ccr/core/contracts/app";
import {
  CLOUD_SYNC_DEFAULT_BASE_URL,
  CLOUD_SYNC_SCOPE_IDS,
  DEFAULT_CLOUD_SYNC_SCOPES
} from "@ccr/core/contracts/app";
import {
  exportCloudSyncUsageEvents,
  importCloudSyncUsageEvents,
  type CloudSyncUsageEvent
} from "@ccr/core/usage/store";

type CloudSyncKeyMaterial = {
  key: Buffer;
  keyId: string;
  keyMode: CloudSyncConfig["keyMode"];
  keySalt: string;
};

type CloudSyncSnapshotConfig = Partial<Pick<
  AppConfig,
  | "APIKEY"
  | "APIKEYS"
  | "Providers"
  | "Router"
  | "agent"
  | "botConfigs"
  | "botGateway"
  | "language"
  | "mediaTools"
  | "observability"
  | "overviewWidgets"
  | "plugins"
  | "preferredProvider"
  | "profile"
  | "providerPlugins"
  | "theme"
  | "toolHub"
  | "trayComponentVariants"
  | "trayIcon"
  | "trayProgressTargetTokens"
  | "trayWidgets"
  | "trayWindowModules"
  | "virtualModelProfiles"
>> & {
  trayBalanceProgress?: AppConfig["trayBalanceProgress"] | null;
};

type CloudSyncSnapshot = {
  config: CloudSyncSnapshotConfig;
  exportedAt: string;
  kind: "claude-code-router-cloud-sync-snapshot";
  usageEvents?: CloudSyncUsageEvent[];
  version: 1 | 2 | 3;
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

type StoredCloudSyncSnapshot = {
  encrypted: EncryptedPayload;
  kind: "claude-code-router-cloud-sync-baseline";
  version: 1;
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
  baseSnapshot?: CloudSyncSnapshot;
  forceEncryptionRewrite?: boolean;
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
  fields: CloudSyncConflictField[];
  identity: string;
  keyMaterial: CloudSyncKeyMaterial;
  localSnapshot: CloudSyncSnapshot;
  remoteSnapshot: CloudSyncSnapshot;
  remoteSnapshotHash?: string;
};

const cloudSyncSnapshotKind = "claude-code-router-cloud-sync-snapshot";
const storedCloudSyncSnapshotKind = "claude-code-router-cloud-sync-baseline";
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
const cloudSyncRequestTimeoutMs = 30_000;
const cloudSyncResponseMaxBytes = 8 * 1024 * 1024;
const cloudSyncPaginationMaxMs = 60_000;
const cloudSyncPaginationMaxPages = 100;
const cloudSyncPaginationMaxOperations = 10_000;
const cloudSyncPaginationMaxBytes = 32 * 1024 * 1024;

const cloudSyncKeyCache = new Map<string, Buffer>();
const pendingCloudSyncAuth = new Map<string, PendingCloudSyncAuth>();
const pendingCloudSyncConflicts = new Map<string, PendingCloudSyncConflict>();
const pendingCloudSyncConflictIds = new Map<string, string>();
const cloudTokenRefreshInFlight = new Map<string, Promise<CloudTokenRefreshPatch>>();
const cloudTokenRefreshRecent = new Map<string, { expiresAt: number; patch: CloudTokenRefreshPatch }>();
const cloudTokenRefreshGeneration = new Map<string, number>();
const cloudTokenRefreshRecentMs = 60 * 1000;

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

class CloudSyncRemoteKeyChangedError extends Error {
  readonly config: AppConfig;

  constructor(config: AppConfig) {
    super("The cloud sync encryption key changed on another device. Unlock sync with the new password or key file.");
    this.name = "CloudSyncRemoteKeyChangedError";
    this.config = config;
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
    scopes: [...cloudSync.scopes],
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
      enabled: false,
      lastSyncError: undefined
    }
  };
}

export function logoutCloudSyncConfig(config: AppConfig): AppConfig {
  clearPendingCloudSyncConflict(config);
  forgetCloudTokenRefreshState(config.cloudSync);
  if (config.cloudSync.keyId) {
    cloudSyncKeyCache.delete(config.cloudSync.keyId);
  }
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  return {
    ...config,
    cloudSync: {
      baseUrl: cloudSync.baseUrl,
      deviceName: cloudSync.deviceName,
      enabled: false,
      lastRevision: 0,
      namespace: cloudSync.namespace,
      scopes: [...cloudSync.scopes]
    }
  };
}

export function startCloudSyncLogin(config: AppConfig, options: CloudSyncLoginOptions = {}): CloudSyncLoginResult {
  const nextConfig = prepareCloudSyncAuthConfig(config);
  return {
    config: nextConfig,
    loginUrl: cloudSyncLoginUrl(nextConfig.cloudSync.baseUrl, options.callbackUrl),
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
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingCloudSyncAuth.delete(callbackKey);
    throw new Error("Cloud sync login session is invalid or expired. Sign in again.");
  }

  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const response = await cloudFetch(cloudSyncUrl(cloudSync.baseUrl, "/auth/handoff"), {
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
    if ([400, 401, 403, 404, 410, 422].includes(response.status)) {
      pendingCloudSyncAuth.delete(callbackKey);
    }
    throw new Error(`Cloud login handoff failed (${response.status}): ${cloudErrorMessage(data)}`);
  }

  const tokenResponse = data as CloudTokenResponse;
  const user = tokenResponse.user;
  const authenticatedConfig = applyCloudSyncAuthTokens(config, {
    accessToken: requiredString(tokenResponse.accessToken, "Cloud access token"),
    refreshToken: requiredString(tokenResponse.refreshToken, "Cloud refresh token"),
    refreshTokenExpiresAt: optionalString(tokenResponse.refreshTokenExpiresAt),
    userAvatarUrl: optionalString(user?.avatarUrl),
    userEmail: optionalString(user?.email),
    userId: requiredString(user?.id, "Cloud user ID"),
    userLogin: optionalString(user?.githubLogin),
    userName: optionalString(user?.githubName)
  });
  pendingCloudSyncAuth.delete(callbackKey);
  return authenticatedConfig;
}

export function applyCloudSyncAuthTokens(config: AppConfig, input: CloudSyncAuthTokenInput): AppConfig {
  const accessToken = requiredString(input.accessToken, "Cloud access token");
  const refreshToken = requiredString(input.refreshToken, "Cloud refresh token");
  const currentCloudSync = normalizedCloudSyncConfig(config.cloudSync);
  const nextUserId = optionalString(input.userId);
  const hasExistingSyncGeneration = Boolean(
    currentCloudSync.accessToken ||
    currentCloudSync.refreshToken ||
    currentCloudSync.deviceId ||
    currentCloudSync.keyId ||
    currentCloudSync.lastRevision > 0
  );
  const accountChanged = hasExistingSyncGeneration && (
    !currentCloudSync.userId ||
    !nextUserId ||
    currentCloudSync.userId !== nextUserId
  );
  const cloudSync = accountChanged
    ? normalizedCloudSyncConfig(logoutCloudSyncConfig(config).cloudSync)
    : currentCloudSync;
  return {
    ...config,
    cloudSync: {
      ...cloudSync,
      accessToken,
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
    return config;
  }
  if (cloudSync.userId && cloudSync.userLogin) {
    return config;
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
  if (existsSync(keyFilePath)) {
    throw new Error("Cloud sync key file already exists. Choose a new path to avoid losing an existing encryption key.");
  }
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
  const baseUrl = normalizedCloudSyncConfig(config.cloudSync).baseUrl;
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
      refreshTokenExpiresAt: optionalString(existingCloudSync.refreshTokenExpiresAt),
      scopes: normalizeCloudSyncScopes(request.scopes ?? existingCloudSync.scopes)
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

  const remote = await pullAllCloudDocuments(nextConfig, 0);
  nextConfig = remote.config;
  validateCloudDocument(remote.data.document, nextConfig.cloudSync, 0);
  if (remote.data.document.revision > 0) {
    const encryptedPayload = latestCloudSyncEncryptedPayload(
      remote.data.document,
      remote.data.operations ?? []
    );
    if (!encryptedPayload) {
      throw new Error("Cloud sync is configured, but the remote document has no decryptable snapshot.");
    }
    const previousKeyId = nextConfig.cloudSync.keyId;
    const remoteKeyConfig = cloudSyncConfigForEncryptedPayload(nextConfig.cloudSync, encryptedPayload);
    const keyMaterial = resolveCloudSyncKey(remoteKeyConfig, request, { allowCreateSalt: false });
    nextConfig = {
      ...nextConfig,
      cloudSync: {
        ...nextConfig.cloudSync,
        keyId: keyMaterial.keyId,
        keyFilePath: keyMaterial.keyMode === "key-file"
          ? request.keyFilePath || nextConfig.cloudSync.keyFilePath
          : undefined,
        keyMode: keyMaterial.keyMode,
        keySalt: keyMaterial.keySalt
      }
    };
    if (previousKeyId && previousKeyId !== keyMaterial.keyId) {
      cloudSyncKeyCache.delete(previousKeyId);
    }
    const snapshot = resolveCloudDocumentSnapshot(
      remote.data.document,
      remote.data.operations ?? [],
      keyMaterial
    ).snapshot;
    nextConfig = await applyCloudSyncSnapshotState(nextConfig, snapshot);
    nextConfig = withCloudSyncSuccess(nextConfig, {
      lastRevision: remote.data.document.revision,
      snapshotHash: snapshotHash(snapshot)
    }, snapshot, keyMaterial);
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
        snapshotHash: undefined
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
      keyFilePath: keyMaterial.keyMode === "key-file"
        ? request.keyFilePath || nextConfig.cloudSync.keyFilePath
        : undefined,
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

export async function rotateCloudSyncKey(
  config: AppConfig,
  request: CloudSyncRotateKeyRequest
): Promise<CloudSyncOperationResult> {
  return withCloudSyncOperationAuthHandling(async () => {
    const readyConfig = requireCloudSyncEnabled(config);
    const previousKeyId = requiredString(readyConfig.cloudSync.keyId, "Current cloud sync key ID");
    const pulled = await pullCloudSyncConfigInternal(readyConfig);
    if (!pulled.config || pulled.conflict || pulled.conflictResolution || pulled.keyRotationRequired) {
      return pulled;
    }

    const latestConfig = pulled.config;
    const previousKeyMaterial = resolveCloudSyncKey(
      latestConfig.cloudSync,
      {},
      { allowCreateSalt: false }
    );
    const previousBaseSnapshot = cloudSyncSnapshotFromUnknown(
      latestConfig.cloudSync.lastSyncedSnapshot,
      previousKeyMaterial
    );
    const nextKeyMaterial = resolveCloudSyncKey({
      ...latestConfig.cloudSync,
      keyFilePath: undefined,
      keyId: undefined,
      keySalt: undefined
    }, request, { allowCreateSalt: true });
    const rotatedConfig: AppConfig = {
      ...latestConfig,
      cloudSync: {
        ...latestConfig.cloudSync,
        keyFilePath: nextKeyMaterial.keyMode === "key-file" ? request.keyFilePath : undefined,
        keyId: nextKeyMaterial.keyId,
        keyMode: nextKeyMaterial.keyMode,
        keySalt: nextKeyMaterial.keySalt,
        lastSyncedSnapshot: previousBaseSnapshot
          ? storedCloudSyncSnapshot(previousBaseSnapshot, nextKeyMaterial)
          : undefined
      }
    };
    const pushed = await pushCloudSyncConfigInternal(rotatedConfig, {}, {
      baseSnapshot: previousBaseSnapshot,
      forceEncryptionRewrite: true,
      keyMaterial: nextKeyMaterial,
      mergeOnConflict: false
    });
    if (!pushed.snapshotPushed) {
      cloudSyncKeyCache.delete(nextKeyMaterial.keyId);
      return {
        ...pushed,
        config: latestConfig,
        message: "Cloud changed while the encryption key was being rotated. Pull the latest changes and retry.",
        status: getCloudSyncStatus(latestConfig)
      };
    }
    if (previousKeyId !== nextKeyMaterial.keyId) {
      cloudSyncKeyCache.delete(previousKeyId);
    }
    return {
      ...pushed,
      message: "Cloud sync encryption key was rotated. Other devices must unlock with the new password or key file."
    };
  });
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
  const conflictResults = cloudSyncConflictResultsFromRequest(
    request,
    pending.descriptor,
    pending.fields
  );
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
  const currentSnapshot = await createCurrentCloudSyncSnapshot(config, pending.baseSnapshot);
  if (!sameCloudSyncSnapshotContent(currentSnapshot, pending.localSnapshot)) {
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
  let mergedConfig = await applyCloudSyncSnapshotState(config, merge.snapshot);
  mergedConfig = {
    ...mergedConfig,
    cloudSync: {
      ...normalizedCloudSyncConfig(mergedConfig.cloudSync),
      lastRevision: pending.descriptor.remoteRevision,
      lastSyncError: undefined,
      lastSyncedSnapshot: storedCloudSyncSnapshot(pending.remoteSnapshot, pending.keyMaterial),
      snapshotHash: pending.remoteSnapshotHash || snapshotHash(pending.remoteSnapshot)
    }
  };

  if (sameCloudSyncSnapshotContent(merge.snapshot, pending.remoteSnapshot)) {
    removePendingCloudSyncConflict(conflictId);
    mergedConfig = withCloudSyncSuccess(mergedConfig, {
      lastRevision: pending.descriptor.remoteRevision,
      snapshotHash: pending.remoteSnapshotHash || snapshotHash(pending.remoteSnapshot)
    }, pending.remoteSnapshot, pending.keyMaterial);
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
  descriptor: CloudSyncConflictResolution,
  fields: CloudSyncConflictField[]
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
    if (item.source === "local" || item.source === "remote") {
      const field = fields.find((candidate) => candidate.path === path);
      if (!field) {
        throw new Error(`Cloud sync conflict path is no longer available: ${path}`);
      }
      const selected = field[item.source];
      results.set(
        path,
        selected.exists ? cloneJson(selected.value) : missingCloudSyncMergeValue
      );
      continue;
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
  const storedBaseSnapshot = readyConfig.cloudSync.lastSyncedSnapshot;
  const cachedBaseKeyMaterial = cloudSyncBaselineKeyMaterial(
    storedBaseSnapshot,
    readyConfig.cloudSync
  );
  let remote = await pullAllCloudDocuments(readyConfig, readyConfig.cloudSync.lastRevision);
  if (
    remote.data.document.revision > 0 &&
    remote.data.document.snapshotRevision === null
  ) {
    remote = await pullAllCloudDocuments(remote.config, 0);
  }
  let nextConfig = remote.config;
  const document = remote.data.document;
  validateCloudDocument(document, nextConfig.cloudSync, readyConfig.cloudSync.lastRevision);

  if (document.revision === 0) {
    nextConfig = withCloudSyncSuccess(nextConfig, {
      lastRevision: document.revision,
      snapshotHash: undefined
    });
    return {
      config: nextConfig,
      message: "Cloud sync has no remote snapshot yet.",
      remoteRevision: document.revision,
      snapshotApplied: false,
      status: getCloudSyncStatus(nextConfig)
    };
  }
  const encryptedPayload = latestCloudSyncEncryptedPayload(
    document,
    remote.data.operations ?? []
  );
  if (!encryptedPayload) {
    throw new Error("Cloud sync returned a non-empty document without an encrypted snapshot.");
  }
  const remoteKeyConfig = cloudSyncConfigForEncryptedPayload(nextConfig.cloudSync, encryptedPayload);
  const remoteKeyChanged = Boolean(
    readyConfig.cloudSync.keyId &&
    remoteKeyConfig.keyId !== readyConfig.cloudSync.keyId
  );
  if (
    remoteKeyChanged &&
    !optionalString(request.password) &&
    !optionalString(request.keyFilePath)
  ) {
    throw new CloudSyncRemoteKeyChangedError(cloudSyncRemoteKeyChangedConfig(nextConfig, remoteKeyConfig));
  }
  const keyMaterial = resolveCloudSyncKey(remoteKeyConfig, request, { allowCreateSalt: false });
  nextConfig = {
    ...nextConfig,
    cloudSync: {
      ...nextConfig.cloudSync,
      keyFilePath: keyMaterial.keyMode === "key-file" ? request.keyFilePath : undefined,
      keyId: keyMaterial.keyId,
      keyMode: keyMaterial.keyMode,
      keySalt: keyMaterial.keySalt
    }
  };
  let baseSnapshot: CloudSyncSnapshot | undefined;
  try {
    baseSnapshot = cloudSyncSnapshotFromUnknown(
      storedBaseSnapshot,
      cachedBaseKeyMaterial ?? keyMaterial
    );
  } catch (error) {
    if (
      !isStoredCloudSyncSnapshot(storedBaseSnapshot) ||
      storedBaseSnapshot.encrypted.keyId === keyMaterial.keyId
    ) {
      throw error;
    }
    // A rotated remote key may be available after the process that held the old
    // in-memory key has restarted. Falling back to a full-config review is safer
    // than blocking forever or treating an unreadable baseline as synchronized.
    baseSnapshot = undefined;
  }

  const currentSnapshot = baseSnapshot
    ? await createCurrentCloudSyncSnapshot(nextConfig, baseSnapshot)
    : undefined;
  const remoteMerge = resolveCloudDocumentSnapshot(
    document,
    remote.data.operations ?? [],
    keyMaterial
  );
  const remoteSnapshot = remoteMerge.snapshot;
  if (
    baseSnapshot &&
    document.revision === readyConfig.cloudSync.lastRevision &&
    !sameCloudSyncSnapshotContent(remoteSnapshot, baseSnapshot)
  ) {
    throw new Error(
      `Cloud sync rejected different remote content for unchanged revision ${document.revision}.`
    );
  }
  if (
    !remoteKeyChanged &&
    baseSnapshot &&
    document.revision === readyConfig.cloudSync.lastRevision &&
    (remote.data.operations?.length ?? 0) === 0 &&
    currentSnapshot &&
    sameCloudSyncSnapshotContent(currentSnapshot, baseSnapshot)
  ) {
    const verifiedSnapshotHash = snapshotHash(remoteSnapshot);
    const baselineNeedsEncryption = !isStoredCloudSyncSnapshot(storedBaseSnapshot);
    const verifiedConfig = (
      baselineNeedsEncryption ||
      nextConfig.cloudSync.lastSyncError ||
      nextConfig.cloudSync.snapshotHash !== verifiedSnapshotHash
    )
      ? {
        ...nextConfig,
        cloudSync: {
          ...nextConfig.cloudSync,
          lastSyncError: undefined,
          lastSyncedSnapshot: baselineNeedsEncryption
            ? storedCloudSyncSnapshot(baseSnapshot, keyMaterial)
            : nextConfig.cloudSync.lastSyncedSnapshot,
          snapshotHash: verifiedSnapshotHash
        }
      }
      : nextConfig;
    const unchangedConfig = sameCloudSyncValue(verifiedConfig, config) ? config : verifiedConfig;
    return {
      config: unchangedConfig,
      message: "Cloud sync is already up to date.",
      mergeApplied: false,
      mergeConflicts: [],
      remoteRevision: document.revision,
      snapshotApplied: false,
      status: getCloudSyncStatus(unchangedConfig)
    };
  }
  if (cachedBaseKeyMaterial && cachedBaseKeyMaterial.keyId !== keyMaterial.keyId) {
    cloudSyncKeyCache.delete(cachedBaseKeyMaterial.keyId);
  }
  let appliedSnapshot = remoteSnapshot;
  let localMerge: CloudSyncMergeResult | undefined;
  let localSnapshot: CloudSyncSnapshot | undefined;
  if (request.apply !== false) {
    localSnapshot = currentSnapshot ?? await createCurrentCloudSyncSnapshot(nextConfig);
    if (!baseSnapshot && !sameCloudSyncSnapshotContent(localSnapshot, remoteSnapshot)) {
      return cloudSyncResolutionRequiredResult({
        config: nextConfig,
        keyMaterial,
        localSnapshot,
        paths: ["config"],
        remoteRevision: document.revision,
        remoteSnapshot,
        remoteSnapshotHash: snapshotHash(remoteSnapshot)
      });
    }
    if (baseSnapshot) {
      const localChanged = !sameCloudSyncSnapshotContent(localSnapshot, baseSnapshot);
      const remoteChanged = !sameCloudSyncSnapshotContent(remoteSnapshot, baseSnapshot);
      if (localChanged && remoteChanged) {
        localMerge = mergeCloudSyncSnapshots(baseSnapshot, localSnapshot, remoteSnapshot);
        appliedSnapshot = localMerge.snapshot;
      } else if (localChanged) {
        localMerge = {
          conflictFields: [],
          conflicts: [],
          snapshot: localSnapshot
        };
        appliedSnapshot = localSnapshot;
      }
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
      remoteSnapshotHash: snapshotHash(remoteSnapshot)
    });
  }
  if (request.apply !== false) {
    nextConfig = await applyCloudSyncSnapshotState(nextConfig, appliedSnapshot);
  }
  const remoteSnapshotHash = snapshotHash(remoteSnapshot);
  if (request.apply === false) {
    nextConfig = withCloudSyncProbeSuccess(nextConfig);
  } else {
    nextConfig = withCloudSyncSuccess(nextConfig, {
      lastRevision: document.revision,
      snapshotHash: remoteSnapshotHash
    }, remoteSnapshot, keyMaterial);
  }

  const mergeApplied = request.apply !== false &&
    Boolean(localMerge || remoteMerge.appliedOperationCount > 0);
  if (request.apply !== false && localMerge) {
    const pushed = await pushCloudSyncConfigInternal(nextConfig, {
      keyFilePath: request.keyFilePath,
      password: request.password
    }, {});
    return {
      ...pushed,
      mergeApplied: pushed.mergeApplied ?? true,
      mergeConflicts: pushed.mergeConflicts ?? [],
      message: pushed.snapshotPushed
        ? "Cloud changes were pulled, merged with local changes, and pushed."
        : pushed.message,
      snapshotApplied: true
    };
  }

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
  if (!cloudSync.enabled || !cloudSync.keyId) {
    return config;
  }
  if (!cloudSyncKeyCache.has(cloudSync.keyId) && !cloudSync.keyFilePath) {
    const message = "Cloud sync is locked. Unlock it with the encryption password before automatic sync can continue.";
    return cloudSync.lastSyncError === message
      ? config
      : {
        ...config,
        cloudSync: {
          ...cloudSync,
          lastSyncError: message
        }
      };
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

export async function autoPullCloudSyncConfig(config: AppConfig): Promise<AppConfig> {
  const cloudSync = normalizedCloudSyncConfig(config.cloudSync);
  if (!cloudSync.enabled || !cloudSync.keyId) {
    return config;
  }
  if (!cloudSyncKeyCache.has(cloudSync.keyId) && !cloudSync.keyFilePath) {
    return config;
  }
  if (pendingCloudSyncConflictForConfig(config)) {
    return config;
  }

  try {
    const result = await pullCloudSyncConfig(config);
    return result.config ?? config;
  } catch (error) {
    if (isCloudSyncAuthExpiredError(error)) {
      return error.config;
    }
    const message = formatError(error);
    return cloudSync.lastSyncError === message
      ? config
      : {
        ...config,
        cloudSync: {
          ...cloudSync,
          lastSyncError: message
        }
      };
  }
}

type CreateCloudSyncSnapshotOptions = {
  baseSnapshot?: CloudSyncSnapshot;
  usageEvents?: CloudSyncUsageEvent[];
};

export function createCloudSyncSnapshot(
  config: AppConfig,
  exportedAt = new Date().toISOString(),
  options: CreateCloudSyncSnapshotOptions = {}
): CloudSyncSnapshot {
  const scopes = normalizeCloudSyncScopes(config.cloudSync.scopes);
  const baseConfig = options.baseSnapshot?.config
    ? cloneJson(options.baseSnapshot.config)
    : {};
  return {
    config: {
      ...baseConfig,
      ...createPortableCloudSyncSnapshotConfig(config, scopes)
    },
    exportedAt,
    kind: cloudSyncSnapshotKind,
    ...(scopes.includes("usage")
      ? { usageEvents: cloneJson(options.usageEvents ?? options.baseSnapshot?.usageEvents ?? []) }
      : options.baseSnapshot?.usageEvents
        ? { usageEvents: cloneJson(options.baseSnapshot.usageEvents) }
        : {}),
    version: 3
  };
}

export function applyCloudSyncSnapshot(config: AppConfig, snapshot: CloudSyncSnapshot): AppConfig {
  if (
    snapshot.kind !== cloudSyncSnapshotKind ||
    (snapshot.version !== 1 && snapshot.version !== 2 && snapshot.version !== 3) ||
    !isObject(snapshot.config)
  ) {
    throw new Error("Cloud snapshot has an unsupported format.");
  }

  const scopes = new Set(normalizeCloudSyncScopes(config.cloudSync.scopes));
  const has = <K extends keyof CloudSyncSnapshotConfig>(scope: CloudSyncScope, key: K): boolean =>
    scopes.has(scope) && Object.hasOwn(snapshot.config, key);
  const appliedConfig: AppConfig = {
    ...config,
    APIKEY: has("api-keys", "APIKEY") && typeof snapshot.config.APIKEY === "string"
      ? snapshot.config.APIKEY
      : config.APIKEY,
    APIKEYS: has("api-keys", "APIKEYS")
      ? cloneJson(snapshot.config.APIKEYS ?? [])
      : config.APIKEYS,
    Providers: has("providers", "Providers") ? cloneJson(snapshot.config.Providers ?? []) : config.Providers,
    Router: has("providers", "Router") ? cloneJson(snapshot.config.Router ?? config.Router) : config.Router,
    agent: has("toolhub", "agent") ? cloneJson(snapshot.config.agent ?? config.agent) : config.agent,
    botConfigs: has("bot", "botConfigs") ? cloneJson(snapshot.config.botConfigs ?? []) : config.botConfigs,
    botGateway: has("bot", "botGateway") ? cloneJson(snapshot.config.botGateway ?? config.botGateway) : config.botGateway,
    mediaTools: has("fusion", "mediaTools") ? cloneJson(snapshot.config.mediaTools ?? config.mediaTools) : config.mediaTools,
    language: has("appearance", "language") && (
      snapshot.config.language === "system" ||
      snapshot.config.language === "en" ||
      snapshot.config.language === "zh"
    )
      ? snapshot.config.language
      : config.language,
    observability: has("usage", "observability")
      ? cloneJson(snapshot.config.observability ?? config.observability)
      : config.observability,
    overviewWidgets: has("overview", "overviewWidgets")
      ? cloneJson(snapshot.config.overviewWidgets ?? [])
      : config.overviewWidgets,
    plugins: has("extensions", "plugins") ? cloneJson(snapshot.config.plugins ?? []) : config.plugins,
    preferredProvider: has("providers", "preferredProvider") && typeof snapshot.config.preferredProvider === "string"
      ? snapshot.config.preferredProvider
      : config.preferredProvider,
    profile: has("agent-profiles", "profile") ? cloneJson(snapshot.config.profile ?? config.profile) : config.profile,
    providerPlugins: has("providers", "providerPlugins")
      ? cloneJson(snapshot.config.providerPlugins ?? [])
      : config.providerPlugins,
    theme: has("appearance", "theme") && (
      snapshot.config.theme === "system" ||
      snapshot.config.theme === "light" ||
      snapshot.config.theme === "dark"
    )
      ? snapshot.config.theme
      : config.theme,
    toolHub: has("toolhub", "toolHub") ? cloneJson(snapshot.config.toolHub ?? config.toolHub) : config.toolHub,
    trayBalanceProgress: has("tray", "trayBalanceProgress")
      ? snapshot.config.trayBalanceProgress
        ? cloneJson(snapshot.config.trayBalanceProgress)
        : undefined
      : config.trayBalanceProgress,
    trayComponentVariants: has("tray", "trayComponentVariants")
      ? cloneJson(snapshot.config.trayComponentVariants ?? config.trayComponentVariants)
      : config.trayComponentVariants,
    trayIcon: has("tray", "trayIcon") ? cloneJson(snapshot.config.trayIcon ?? config.trayIcon) : config.trayIcon,
    trayProgressTargetTokens: has("tray", "trayProgressTargetTokens")
      ? snapshot.config.trayProgressTargetTokens ?? config.trayProgressTargetTokens
      : config.trayProgressTargetTokens,
    trayWidgets: has("tray", "trayWidgets") ? cloneJson(snapshot.config.trayWidgets ?? []) : config.trayWidgets,
    trayWindowModules: has("tray", "trayWindowModules")
      ? cloneJson(snapshot.config.trayWindowModules ?? [])
      : config.trayWindowModules,
    virtualModelProfiles: has("fusion", "virtualModelProfiles")
      ? cloneJson(snapshot.config.virtualModelProfiles ?? [])
      : config.virtualModelProfiles
  };
  return restoreCloudSyncDeviceLocalFields(config, appliedConfig);
}

async function createCurrentCloudSyncSnapshot(
  config: AppConfig,
  baseSnapshot?: CloudSyncSnapshot
): Promise<CloudSyncSnapshot> {
  const scopes = normalizeCloudSyncScopes(config.cloudSync.scopes);
  const usageEvents = scopes.includes("usage")
    ? await exportCloudSyncUsageEvents()
    : undefined;
  return createCloudSyncSnapshot(config, new Date().toISOString(), {
    baseSnapshot,
    usageEvents
  });
}

async function applyCloudSyncSnapshotState(
  config: AppConfig,
  snapshot: CloudSyncSnapshot
): Promise<AppConfig> {
  const applied = applyCloudSyncSnapshot(config, snapshot);
  if (
    normalizeCloudSyncScopes(config.cloudSync.scopes).includes("usage") &&
    Array.isArray(snapshot.usageEvents)
  ) {
    await importCloudSyncUsageEvents(snapshot.usageEvents);
  }
  return applied;
}

function createPortableCloudSyncSnapshotConfig(
  config: AppConfig,
  scopes: CloudSyncScope[]
): CloudSyncSnapshotConfig {
  const selected = new Set(scopes);
  const snapshot: CloudSyncSnapshotConfig = {};
  if (selected.has("providers")) {
    Object.assign(snapshot, {
      Providers: cloneJson(config.Providers),
      Router: cloneJson(config.Router),
      preferredProvider: config.preferredProvider,
      providerPlugins: cloneJson(config.providerPlugins ?? [])
    });
  }
  if (selected.has("agent-profiles")) {
    snapshot.profile = cloneJson(config.profile);
  }
  if (selected.has("usage")) {
    snapshot.observability = cloneJson(config.observability);
  }
  if (selected.has("fusion")) {
    snapshot.mediaTools = cloneJson(config.mediaTools);
    snapshot.virtualModelProfiles = cloneJson(config.virtualModelProfiles ?? []);
  }
  if (selected.has("api-keys")) {
    snapshot.APIKEY = config.APIKEY;
    snapshot.APIKEYS = cloneJson(config.APIKEYS);
  }
  if (selected.has("extensions")) {
    snapshot.plugins = cloneJson(config.plugins);
  }
  if (selected.has("bot")) {
    snapshot.botConfigs = cloneJson(config.botConfigs);
    snapshot.botGateway = cloneJson(config.botGateway);
  }
  if (selected.has("toolhub")) {
    snapshot.agent = cloneJson(config.agent);
    snapshot.toolHub = cloneJson(config.toolHub);
  }
  if (selected.has("appearance")) {
    snapshot.language = config.language;
    snapshot.theme = config.theme;
  }
  if (selected.has("tray")) {
    snapshot.trayBalanceProgress = config.trayBalanceProgress
      ? cloneJson(config.trayBalanceProgress)
      : null;
    snapshot.trayComponentVariants = cloneJson(config.trayComponentVariants);
    snapshot.trayIcon = config.trayIcon;
    snapshot.trayProgressTargetTokens = config.trayProgressTargetTokens;
    snapshot.trayWidgets = cloneJson(config.trayWidgets);
    snapshot.trayWindowModules = cloneJson(config.trayWindowModules);
  }
  if (selected.has("overview")) {
    snapshot.overviewWidgets = cloneJson(config.overviewWidgets);
  }

  stripDeviceLocalMcpFields(snapshot.agent?.mcpServers);
  stripDeviceLocalMcpFields(snapshot.toolHub?.mcpServers);
  stripDeviceLocalBotGatewayFields(snapshot.botGateway);
  for (const botConfig of snapshot.botConfigs ?? []) {
    stripDeviceLocalBotGatewayFields(botConfig.botGateway);
  }
  if (snapshot.mediaTools) {
    deleteObjectKeys(snapshot.mediaTools, ["allowedInputRoots"]);
  }
  for (const plugin of snapshot.plugins ?? []) {
    deleteObjectKeys(plugin, ["module"]);
  }
  if (snapshot.profile) {
    deleteObjectKeys(snapshot.profile.claudeCode, ["settingsFile"]);
    deleteObjectKeys(snapshot.profile.codex, ["codexCliPath", "codexHome", "configFile"]);
    for (const profile of snapshot.profile.profiles ?? []) {
      deleteObjectKeys(profile, [
        "appPath",
        "codexCliPath",
        "codexHome",
        "configFile",
        "env",
        "settingsFile"
      ]);
      if (profile.botGateway) {
        stripDeviceLocalBotGatewayFields(profile.botGateway);
      }
    }
  }
  return snapshot;
}

function restoreCloudSyncDeviceLocalFields(local: AppConfig, applied: AppConfig): AppConfig {
  const newBotGatewayDefaults = cloudSyncNewBotGatewayDeviceDefaults(local.botGateway);
  restoreMcpDeviceLocalFields(local.agent?.mcpServers, applied.agent?.mcpServers);
  restoreMcpDeviceLocalFields(local.toolHub?.mcpServers, applied.toolHub?.mcpServers);
  restoreObjectKeys(applied.botGateway, local.botGateway, cloudSyncBotGatewayDeviceLocalKeys);
  const localBotConfigById = new Map(
    local.botConfigs.map((item) => [item.id, item] as const)
  );
  for (const target of applied.botConfigs) {
    const source = localBotConfigById.get(target.id);
    restoreObjectKeys(
      target.botGateway,
      source?.botGateway ?? newBotGatewayDefaults,
      cloudSyncBotGatewayDeviceLocalKeys
    );
  }
  restoreObjectKeys(applied.mediaTools, local.mediaTools, ["allowedInputRoots"]);
  restoreMatchedArrayFields(
    applied.plugins,
    local.plugins,
    (item) => optionalString(item.id),
    (target, source) => restoreObjectKeys(target, source, ["module"])
  );
  restoreObjectKeys(applied.profile.claudeCode, local.profile.claudeCode, ["settingsFile"]);
  restoreObjectKeys(applied.profile.codex, local.profile.codex, ["codexCliPath", "codexHome", "configFile"]);
  restoreMatchedArrayFields(
    applied.profile.profiles,
    local.profile.profiles,
    (item) => optionalString(item.id),
    (target, source) => {
      restoreObjectKeys(target, source, [
        "appPath",
        "codexCliPath",
        "codexHome",
        "configFile",
        "env",
        "settingsFile"
      ]);
      if (target.botGateway) {
        restoreObjectKeys(
          target.botGateway,
          source.botGateway ?? newBotGatewayDefaults,
          cloudSyncBotGatewayDeviceLocalKeys
        );
      }
    }
  );
  const localProfileIds = new Set(local.profile.profiles.map((item) => item.id));
  for (const target of applied.profile.profiles) {
    if (target.botGateway && !localProfileIds.has(target.id)) {
      restoreObjectKeys(target.botGateway, newBotGatewayDefaults, cloudSyncBotGatewayDeviceLocalKeys);
    }
  }
  return applied;
}

const cloudSyncBotGatewayDeviceLocalKeys = [
  "autoStartIntegration",
  "conversationRef",
  "credentials",
  "cwd",
  "enabled",
  "integrationConfig",
  "integrationId",
  "sourceDir",
  "stateDir",
  "tenantId"
];

function cloudSyncNewBotGatewayDeviceDefaults(local: AppConfig["botGateway"]): object {
  return {
    autoStartIntegration: false,
    credentials: {},
    cwd: local.cwd,
    enabled: false,
    integrationConfig: {},
    integrationId: "",
    sourceDir: local.sourceDir,
    stateDir: local.stateDir,
    tenantId: ""
  };
}

function stripDeviceLocalMcpFields(servers: AppConfig["agent"]["mcpServers"] | undefined): void {
  for (const server of servers ?? []) {
    if (server.transport === "stdio") {
      deleteObjectKeys(server, ["cwd", "env"]);
    }
  }
}

function stripDeviceLocalBotGatewayFields(value: AppConfig["botGateway"] | undefined): void {
  if (value) {
    deleteObjectKeys(value, cloudSyncBotGatewayDeviceLocalKeys);
  }
}

function restoreMcpDeviceLocalFields(
  localServers: AppConfig["agent"]["mcpServers"] | undefined,
  targetServers: AppConfig["agent"]["mcpServers"] | undefined
): void {
  const localNames = new Set((localServers ?? []).map((item) => item.name));
  restoreMatchedArrayFields(
    targetServers ?? [],
    localServers ?? [],
    (item) => optionalString(item.name),
    (target, source) => {
      if (target.transport === "stdio" && source.transport === "stdio") {
        restoreObjectKeys(target, source, ["cwd", "env"]);
      }
    }
  );
  for (const target of targetServers ?? []) {
    if (target.transport === "stdio" && !localNames.has(target.name)) {
      target.env = {};
    }
  }
}

function restoreMatchedArrayFields<T>(
  targets: T[],
  sources: T[],
  identity: (item: T) => string | undefined,
  restore: (target: T, source: T) => void
): void {
  const sourceById = new Map(
    sources
      .map((item) => [identity(item), item] as const)
      .filter((item): item is readonly [string, T] => Boolean(item[0]))
  );
  for (const target of targets) {
    const id = identity(target);
    const source = id ? sourceById.get(id) : undefined;
    if (source) {
      restore(target, source);
    }
  }
}

function deleteObjectKeys(value: object, keys: string[]): void {
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    delete record[key];
  }
}

function restoreObjectKeys(target: object, source: object, keys: string[]): void {
  const targetRecord = target as Record<string, unknown>;
  const sourceRecord = source as Record<string, unknown>;
  for (const key of keys) {
    if (Object.hasOwn(sourceRecord, key)) {
      targetRecord[key] = cloneJson(sourceRecord[key]);
    } else {
      delete targetRecord[key];
    }
  }
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
  const hasUsageEvents = Array.isArray(base.usageEvents) ||
    Array.isArray(local.usageEvents) ||
    Array.isArray(remote.usageEvents);
  const mergedUsageEvents = hasUsageEvents
    ? mergeCloudSyncValue(
      base.usageEvents ?? [],
      local.usageEvents ?? [],
      remote.usageEvents ?? [],
      "usageEvents",
      conflicts,
      conflictPreference,
      conflictFields,
      conflictResults
    )
    : undefined;
  if (
    hasUsageEvents &&
    (
      isMissingCloudSyncMergeValue(mergedUsageEvents) ||
      !Array.isArray(mergedUsageEvents)
    )
  ) {
    throw new Error("Cloud sync merge produced invalid usage statistics.");
  }

  return {
    conflictFields,
    conflicts,
    snapshot: {
      config: mergedConfig as CloudSyncSnapshotConfig,
      exportedAt: new Date().toISOString(),
      kind: cloudSyncSnapshotKind,
      ...(hasUsageEvents
        ? { usageEvents: mergedUsageEvents as CloudSyncUsageEvent[] }
        : {}),
      version: 3
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
  const relevantOperations = [...operations]
    .sort((left, right) => (left.revision ?? 0) - (right.revision ?? 0))
    .filter((operation) => (
      typeof operation.revision === "number" &&
      operation.baseRevision === operation.revision - 1 &&
      (
        typeof snapshotRevision !== "number" ||
        operation.revision > snapshotRevision
      )
    ));
  const orderedOperations = relevantOperations
    .map((operation) => ({
      operation,
      snapshot: decryptCloudOperationSnapshot(operation, keyMaterial)
    }));
  const inferredSnapshotRevision = orderedOperations.reduce<number | undefined>(
    (latest, item) => {
      if (
        item.snapshot &&
        typeof item.operation.revision === "number" &&
        sameCloudSyncSnapshotContent(item.snapshot, documentSnapshot)
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
    if (!operationSnapshot) {
      throw new Error(
        `Cloud sync operation at revision ${item.operation.revision} uses an unsupported format. Update CCR before syncing again.`
      );
    }
    if (!sameCloudSyncSnapshotContent(snapshot, operationSnapshot)) {
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

  const baseKeys = [...baseMap.keys()];
  const localKeys = [...localMap.keys()];
  const remoteKeys = [...remoteMap.keys()];
  const localReordered = primitiveCloudSyncArrayReordered(baseKeys, localKeys);
  const remoteReordered = primitiveCloudSyncArrayReordered(baseKeys, remoteKeys);
  if (
    localReordered &&
    remoteReordered &&
    !sameCloudSyncValue(
      localKeys.filter((key) => remoteMap.has(key)),
      remoteKeys.filter((key) => localMap.has(key))
    )
  ) {
    return undefined;
  }
  const primaryKeys = remoteReordered && !localReordered ? remoteKeys : localKeys;
  const secondaryKeys = primaryKeys === localKeys ? remoteKeys : localKeys;
  const keys = uniqueStrings([
    ...primaryKeys,
    ...secondaryKeys,
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
    usageEvents: ["id"],
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

function sameCloudSyncSnapshotContent(
  left: CloudSyncSnapshot,
  right: CloudSyncSnapshot
): boolean {
  return sameCloudSyncValue(left.config, right.config) &&
    sameCloudSyncValue(left.usageEvents ?? [], right.usageEvents ?? []);
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
        keyFilePath: keyMaterial.keyMode === "key-file" ? request.keyFilePath : undefined,
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

  const lastSyncedSnapshot = options.baseSnapshot ??
    cloudSyncSnapshotFromUnknown(readyConfig.cloudSync.lastSyncedSnapshot, keyMaterial);
  const snapshot = await createCurrentCloudSyncSnapshot(readyConfig, lastSyncedSnapshot);
  if (
    !request.force &&
    !options.forceEncryptionRewrite &&
    lastSyncedSnapshot &&
    lastSyncedSnapshot.version === snapshot.version &&
    sameCloudSyncSnapshotContent(lastSyncedSnapshot, snapshot)
  ) {
    const baselineNeedsEncryption = !isStoredCloudSyncSnapshot(
      readyConfig.cloudSync.lastSyncedSnapshot
    );
    const nextConfig = readyConfig.cloudSync.lastSyncError || baselineNeedsEncryption
      ? {
        ...readyConfig,
        cloudSync: {
          ...readyConfig.cloudSync,
          lastSyncError: undefined,
          lastSyncedSnapshot: baselineNeedsEncryption
            ? storedCloudSyncSnapshot(lastSyncedSnapshot, keyMaterial)
            : readyConfig.cloudSync.lastSyncedSnapshot
        }
      }
      : readyConfig;
    return {
      config: nextConfig,
      message: "Cloud sync is already up to date.",
      remoteRevision: readyConfig.cloudSync.lastRevision,
      snapshotPushed: false,
      status: getCloudSyncStatus(nextConfig)
    };
  }
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
  if (!document) {
    throw new Error("Cloud sync server accepted the operation without returning a document.");
  }
  validateCloudDocument(document, response.config.cloudSync, baseRevision);
  if (document.revision <= baseRevision) {
    throw new Error("Cloud sync server accepted the operation without advancing the document revision.");
  }

  const nextConfig = withCloudSyncSuccess(response.config, {
    lastRevision: remoteRevision,
    snapshotHash: snapshotHash(snapshot)
  }, snapshot, keyMaterial);

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

  if (!remoteDocument) {
    return cloudSyncConflictResult(
      responseConfig,
      "Cloud has a newer encrypted snapshot, but it could not be loaded for automatic merge.",
      remoteRevision
    );
  }
  validateCloudDocument(remoteDocument, responseConfig.cloudSync, 0);
  if (!latestCloudSyncEncryptedPayload(remoteDocument, operationCollection.operations)) {
    return cloudSyncConflictResult(
      responseConfig,
      "Cloud has a newer encrypted snapshot, but it could not be loaded for automatic merge.",
      remoteRevision
    );
  }

  const baseSnapshot = cloudSyncSnapshotFromUnknown(
    responseConfig.cloudSync.lastSyncedSnapshot,
    keyMaterial
  );
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
      remoteSnapshotHash: snapshotHash(remoteSnapshot)
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
      remoteSnapshotHash: snapshotHash(remoteSnapshot)
    });
  }
  let mergedConfig = await applyCloudSyncSnapshotState(responseConfig, merge.snapshot);
  mergedConfig = {
    ...mergedConfig,
    cloudSync: {
      ...normalizedCloudSyncConfig(mergedConfig.cloudSync),
      lastRevision: remoteDocument.revision,
      lastSyncError: undefined,
      lastSyncedSnapshot: storedCloudSyncSnapshot(remoteSnapshot, keyMaterial),
      snapshotHash: snapshotHash(remoteSnapshot)
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
  const fields = describeCloudSyncConflictFields(
    baseSnapshot,
    localSnapshot,
    remoteSnapshot,
    normalizedPaths
  );
  const descriptor: CloudSyncConflictResolution = {
    expiresAt: new Date(expiresAt).toISOString(),
    fields: fields.map(redactCloudSyncConflictField),
    id,
    paths: normalizedPaths,
    remoteRevision
  };
  const pending: PendingCloudSyncConflict = {
    baseSnapshot: baseSnapshot ? cloneJson(baseSnapshot) : undefined,
    descriptor,
    fields,
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

function redactCloudSyncConflictField(field: CloudSyncConflictField): CloudSyncConflictField {
  if (
    !cloudSyncConflictPathIsSensitive(field.path) &&
    !cloudSyncConflictValueContainsSensitiveData(field.local.value) &&
    !cloudSyncConflictValueContainsSensitiveData(field.remote.value)
  ) {
    return field;
  }
  return {
    local: { exists: field.local.exists },
    path: field.path,
    remote: { exists: field.remote.exists },
    sensitive: true
  };
}

function cloudSyncConflictPathIsSensitive(path: string): boolean {
  return path.split(/[.[\]]+/).some(cloudSyncSensitiveFieldName);
}

function cloudSyncConflictValueContainsSensitiveData(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(cloudSyncConflictValueContainsSensitiveData);
  }
  if (!isObject(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nestedValue]) => (
    cloudSyncSensitiveFieldName(key) ||
    cloudSyncConflictValueContainsSensitiveData(nestedValue)
  ));
}

function cloudSyncSensitiveFieldName(name: string): boolean {
  const normalized = name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return /^(?:apikeys?|authorization|credentials?|headers?|passwords?|secrets?)$/.test(normalized) ||
    /^(?:access|auth|bearer|id|refresh|session)?tokens?$/.test(normalized) ||
    /^(?:access|api|client|private|secret|session)(?:key|secret)$/.test(normalized);
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
    if (isCloudSyncRemoteKeyChangedError(error)) {
      return {
        config: error.config,
        keyRotationRequired: true,
        message: error.message,
        snapshotApplied: false,
        snapshotPushed: false,
        status: getCloudSyncStatus(error.config)
      };
    }
    if (isCloudSyncAuthExpiredError(error)) {
      return {
        authExpired: true,
        config: error.config,
        message: error.message,
        snapshotApplied: false,
        snapshotPushed: false,
        status: getCloudSyncStatus(error.config)
      };
    }
    throw error;
  }
}

function isCloudSyncAuthExpiredError(error: unknown): error is CloudSyncAuthExpiredError {
  return error instanceof CloudSyncAuthExpiredError;
}

function isCloudSyncRemoteKeyChangedError(error: unknown): error is CloudSyncRemoteKeyChangedError {
  return error instanceof CloudSyncRemoteKeyChangedError;
}

function cloudSyncLoggedOutConfig(config: AppConfig): AppConfig {
  forgetCloudTokenRefreshState(config.cloudSync);
  const nextConfig = disableCloudSyncConfig(config);
  return {
    ...nextConfig,
    cloudSync: {
      ...normalizedCloudSyncConfig(nextConfig.cloudSync),
      accessToken: undefined,
      lastSyncError: cloudSyncAuthExpiredMessage,
      refreshToken: undefined,
      refreshTokenExpiresAt: undefined
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
  const collected = cloudSyncOperationsFromUnknown(operations);
  const seenCursors = new Set<number>();
  const startedAt = Date.now();
  let pageCount = 1;
  let collectedBytes = cloudSyncOperationCollectionBytes(collected);
  assertCloudSyncOperationCollectionLimits(pageCount, collected.length, collectedBytes, startedAt);

  while (more) {
    if (Date.now() - startedAt >= cloudSyncPaginationMaxMs) {
      throw new Error("Cloud sync operation pagination exceeded the time limit.");
    }
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
    const pageOperations = cloudSyncOperationsFromUnknown(page.data.operations);
    collected.push(...pageOperations);
    pageCount += 1;
    collectedBytes += cloudSyncOperationCollectionBytes(pageOperations);
    assertCloudSyncOperationCollectionLimits(pageCount, collected.length, collectedBytes, startedAt);
    more = page.data.pagination?.hasMore === true;
    cursor = page.data.pagination?.nextRevision;
  }
  if (nextDocument) {
    validateCloudOperations(collected, nextDocument);
  }

  return {
    config: nextConfig,
    document: nextDocument,
    operations: collected
  };
}

function cloudSyncOperationsFromUnknown(value: unknown): CloudOperation[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((operation) => !isObject(operation))) {
    throw new Error("Cloud sync response contains an invalid operation list.");
  }
  return value as CloudOperation[];
}

function cloudSyncOperationCollectionBytes(operations: CloudOperation[]): number {
  return Buffer.byteLength(JSON.stringify(operations), "utf8");
}

function assertCloudSyncOperationCollectionLimits(
  pageCount: number,
  operationCount: number,
  byteCount: number,
  startedAt: number
): void {
  if (pageCount > cloudSyncPaginationMaxPages) {
    throw new Error("Cloud sync operation pagination exceeded the page limit.");
  }
  if (operationCount > cloudSyncPaginationMaxOperations) {
    throw new Error("Cloud sync operation pagination exceeded the operation limit.");
  }
  if (byteCount > cloudSyncPaginationMaxBytes) {
    throw new Error("Cloud sync operation pagination exceeded the size limit.");
  }
  if (Date.now() - startedAt > cloudSyncPaginationMaxMs) {
    throw new Error("Cloud sync operation pagination exceeded the time limit.");
  }
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
  const response = await cloudFetch(url, {
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
  const refreshCacheKey = `${normalizeBaseUrl(cloudSync.baseUrl)}\n${refreshToken}`;
  const recent = cloudTokenRefreshRecent.get(refreshCacheKey);
  if (recent) {
    if (recent.expiresAt > Date.now()) {
      return recent.patch;
    }
    cloudTokenRefreshRecent.delete(refreshCacheKey);
  }

  const inFlight = cloudTokenRefreshInFlight.get(refreshCacheKey);
  if (inFlight) {
    return inFlight;
  }

  const generation = cloudTokenRefreshGeneration.get(refreshCacheKey) ?? 0;
  const refresh = fetchCloudTokenRefreshPatch(cloudSync, refreshToken)
    .then((patch) => {
      if ((cloudTokenRefreshGeneration.get(refreshCacheKey) ?? 0) === generation) {
        rememberCloudTokenRefreshPatch(refreshCacheKey, patch);
      }
      return patch;
    })
    .finally(() => {
      cloudTokenRefreshInFlight.delete(refreshCacheKey);
    });
  cloudTokenRefreshInFlight.set(refreshCacheKey, refresh);
  return refresh;
}

async function fetchCloudTokenRefreshPatch(
  cloudSync: CloudSyncConfig,
  refreshToken: string
): Promise<CloudTokenRefreshPatch> {
  const response = await cloudFetch(cloudSyncUrl(cloudSync.baseUrl, "/auth/refresh"), {
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

function rememberCloudTokenRefreshPatch(refreshCacheKey: string, patch: CloudTokenRefreshPatch): void {
  const entry = {
    expiresAt: Date.now() + cloudTokenRefreshRecentMs,
    patch
  };
  cloudTokenRefreshRecent.set(refreshCacheKey, entry);
  setTimeout(() => {
    if (cloudTokenRefreshRecent.get(refreshCacheKey) === entry) {
      cloudTokenRefreshRecent.delete(refreshCacheKey);
    }
  }, cloudTokenRefreshRecentMs).unref();
}

function forgetCloudTokenRefreshState(cloudSync: CloudSyncConfig): void {
  const cachePrefix = `${normalizeBaseUrl(cloudSync.baseUrl)}\n`;
  const refreshToken = optionalString(cloudSync.refreshToken);
  const keys = new Set([
    ...[...cloudTokenRefreshRecent.keys()].filter((key) => key.startsWith(cachePrefix)),
    ...[...cloudTokenRefreshInFlight.keys()].filter((key) => key.startsWith(cachePrefix)),
    ...[...cloudTokenRefreshGeneration.keys()].filter((key) => key.startsWith(cachePrefix)),
    ...(refreshToken ? [`${cachePrefix}${refreshToken}`] : [])
  ]);
  for (const refreshCacheKey of keys) {
    cloudTokenRefreshRecent.delete(refreshCacheKey);
    cloudTokenRefreshInFlight.delete(refreshCacheKey);
    invalidateCloudTokenRefreshGeneration(refreshCacheKey);
  }
}

function invalidateCloudTokenRefreshGeneration(refreshCacheKey: string): void {
  const generation = (cloudTokenRefreshGeneration.get(refreshCacheKey) ?? 0) + 1;
  cloudTokenRefreshGeneration.set(refreshCacheKey, generation);
  setTimeout(() => {
    if (cloudTokenRefreshGeneration.get(refreshCacheKey) === generation) {
      cloudTokenRefreshGeneration.delete(refreshCacheKey);
    }
  }, cloudTokenRefreshRecentMs).unref();
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
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > cloudSyncResponseMaxBytes) {
    throw new Error("Cloud sync response is too large.");
  }
  if (!response.body) {
    return {};
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) {
      break;
    }
    totalBytes += item.value.byteLength;
    if (totalBytes > cloudSyncResponseMaxBytes) {
      await reader.cancel();
      throw new Error("Cloud sync response is too large.");
    }
    chunks.push(item.value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(body);
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

  const effectiveInput = input.password || input.keyFilePath
    ? input
    : cloudSync.keyFilePath
      ? { keyFilePath: cloudSync.keyFilePath }
      : input;
  const secret = readSecretInput(effectiveInput);
  const keyMode: CloudSyncConfig["keyMode"] = effectiveInput.keyFilePath ? "key-file" : "password";
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
  try {
    writeFileSync(file, `${JSON.stringify({ kind: keyFileKind, key, version: keyFileVersion }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: privateFileMode
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Cloud sync key file already exists. Choose a new path to avoid losing an existing encryption key.");
    }
    throw error;
  }
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

function latestCloudSyncEncryptedPayload(
  document: CloudDocument,
  operations: CloudOperation[]
): EncryptedPayload | undefined {
  const snapshotRevision = typeof document.snapshotRevision === "number"
    ? document.snapshotRevision
    : -1;
  const operationPayload = [...operations]
    .filter((operation) => (
      typeof operation.revision === "number" &&
      operation.revision > snapshotRevision &&
      isEncryptedPayload(operation.encryptedPayload)
    ))
    .sort((left, right) => (right.revision ?? 0) - (left.revision ?? 0))[0]
    ?.encryptedPayload;
  if (isEncryptedPayload(operationPayload)) {
    return operationPayload;
  }
  return isEncryptedPayload(document.encryptedSnapshot)
    ? document.encryptedSnapshot
    : undefined;
}

function cloudSyncConfigForEncryptedPayload(
  cloudSync: CloudSyncConfig,
  encrypted: EncryptedPayload
): CloudSyncConfig {
  const keyId = requiredString(encrypted.keyId, "Remote cloud sync key ID");
  const keySalt = keySaltFromEncryptedPayload(encrypted);
  return {
    ...normalizedCloudSyncConfig(cloudSync),
    keyId,
    keySalt
  };
}

function cachedCloudSyncKeyMaterial(cloudSync: CloudSyncConfig): CloudSyncKeyMaterial | undefined {
  const normalized = normalizedCloudSyncConfig(cloudSync);
  if (!normalized.keyId || !normalized.keySalt) {
    return undefined;
  }
  const key = cloudSyncKeyCache.get(normalized.keyId);
  if (!key) {
    return undefined;
  }
  return {
    key,
    keyId: normalized.keyId,
    keyMode: normalized.keyMode ?? "password",
    keySalt: normalized.keySalt
  };
}

function cloudSyncRemoteKeyChangedConfig(
  config: AppConfig,
  remoteKeyConfig: CloudSyncConfig
): AppConfig {
  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      keyFilePath: undefined,
      keyId: remoteKeyConfig.keyId,
      keySalt: remoteKeyConfig.keySalt,
      lastSyncError: "The cloud sync encryption key changed on another device. Unlock sync with the new password or key file."
    }
  };
}

function cloudSyncBaselineKeyMaterial(
  value: unknown,
  cloudSync: CloudSyncConfig
): CloudSyncKeyMaterial | undefined {
  if (!isStoredCloudSyncSnapshot(value)) {
    return cachedCloudSyncKeyMaterial(cloudSync);
  }
  const key = cloudSyncKeyCache.get(value.encrypted.keyId);
  if (!key) {
    return undefined;
  }
  return {
    key,
    keyId: value.encrypted.keyId,
    keyMode: cloudSync.keyMode ?? "password",
    keySalt: keySaltFromEncryptedPayload(value.encrypted)
  };
}

function validateCloudDocument(
  document: CloudDocument,
  cloudSync: CloudSyncConfig,
  minimumRevision: number
): void {
  if (!isObject(document)) {
    throw new Error("Cloud sync response does not contain a valid document.");
  }
  if (!Number.isInteger(document.revision) || document.revision < 0) {
    throw new Error("Cloud sync document revision is invalid.");
  }
  if (document.revision < minimumRevision) {
    throw new Error(
      `Cloud sync rejected a remote rollback from revision ${minimumRevision} to ${document.revision}.`
    );
  }
  if (document.namespace !== normalizedCloudSyncConfig(cloudSync).namespace) {
    throw new Error("Cloud sync document namespace does not match the requested namespace.");
  }
  if (
    document.snapshotRevision !== null &&
    document.snapshotRevision !== undefined &&
    (
      !Number.isInteger(document.snapshotRevision) ||
      document.snapshotRevision < 0 ||
      document.snapshotRevision > document.revision
    )
  ) {
    throw new Error("Cloud sync document snapshot revision is invalid.");
  }
  if (
    document.encryptedSnapshot !== undefined &&
    document.encryptedSnapshot !== null &&
    !isEncryptedPayload(document.encryptedSnapshot)
  ) {
    throw new Error("Cloud sync document contains an invalid encrypted snapshot.");
  }
}

function validateCloudOperations(
  operations: CloudOperation[],
  document: CloudDocument
): void {
  const seenRevisions = new Set<number>();
  for (const operation of operations) {
    if (
      !Number.isInteger(operation.revision) ||
      (operation.revision ?? 0) <= 0 ||
      (operation.revision ?? 0) > document.revision ||
      seenRevisions.has(operation.revision as number)
    ) {
      throw new Error("Cloud sync response contains an invalid or duplicate operation revision.");
    }
    seenRevisions.add(operation.revision as number);
    if (
      operation.baseRevision !== undefined &&
      (
        !Number.isInteger(operation.baseRevision) ||
        operation.baseRevision < 0 ||
        operation.baseRevision >= (operation.revision as number)
      )
    ) {
      throw new Error("Cloud sync response contains an invalid operation base revision.");
    }
    if (
      operation.encryptedPayload !== undefined &&
      operation.encryptedPayload !== null &&
      !isEncryptedPayload(operation.encryptedPayload)
    ) {
      throw new Error("Cloud sync response contains an invalid encrypted operation.");
    }
  }
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return isObject(value) &&
    value.algorithm === "aes-256-gcm" &&
    value.encoding === "base64" &&
    typeof value.ciphertext === "string" &&
    value.ciphertext.length > 0 &&
    isCanonicalBase64(value.ciphertext) &&
    typeof value.keyId === "string" &&
    /^ccr-e2ee-v1-[a-zA-Z0-9_-]{32}$/.test(value.keyId) &&
    isObject(value.metadata) &&
    value.metadata.kdf === "pbkdf2-sha256" &&
    value.metadata.kdfIterations === keyDerivationIterations &&
    typeof value.metadata.keySalt === "string" &&
    isCanonicalBase64(value.metadata.keySalt, 16) &&
    typeof value.nonce === "string" &&
    isCanonicalBase64(value.nonce, 12) &&
    typeof value.tag === "string" &&
    isCanonicalBase64(value.tag, 16);
}

function isCanonicalBase64(value: string, byteLength?: number): boolean {
  if (!/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value &&
    (byteLength === undefined || decoded.length === byteLength);
}

function isCloudSyncSnapshot(value: unknown): value is CloudSyncSnapshot {
  return isObject(value) &&
    value.kind === cloudSyncSnapshotKind &&
    (value.version === 1 || value.version === 2 || value.version === 3) &&
    isObject(value.config) &&
    (value.usageEvents === undefined || Array.isArray(value.usageEvents));
}

function storedCloudSyncSnapshot(
  snapshot: CloudSyncSnapshot,
  keyMaterial: CloudSyncKeyMaterial
): StoredCloudSyncSnapshot {
  return {
    encrypted: encryptJson(snapshot, keyMaterial),
    kind: storedCloudSyncSnapshotKind,
    version: 1
  };
}

function isStoredCloudSyncSnapshot(value: unknown): value is StoredCloudSyncSnapshot {
  return isObject(value) &&
    value.kind === storedCloudSyncSnapshotKind &&
    value.version === 1 &&
    isEncryptedPayload(value.encrypted);
}

function isCloudSyncBaselineValue(value: unknown): boolean {
  return isCloudSyncSnapshot(value) || isStoredCloudSyncSnapshot(value);
}

function cloudSyncSnapshotFromUnknown(
  value: unknown,
  keyMaterial?: CloudSyncKeyMaterial
): CloudSyncSnapshot | undefined {
  if (isCloudSyncSnapshot(value)) {
    return cloneJson(value);
  }
  if (!keyMaterial || !isStoredCloudSyncSnapshot(value)) {
    return undefined;
  }
  return decryptSnapshot(value.encrypted, keyMaterial);
}

function isMissingCloudSyncMergeValue(value: unknown): value is typeof missingCloudSyncMergeValue {
  return value === missingCloudSyncMergeValue;
}

function snapshotHash(snapshot: CloudSyncSnapshot): string {
  return createHash("sha256").update(stableStringify({
    config: snapshot.config,
    kind: snapshot.kind,
    usageEvents: snapshot.usageEvents ?? [],
    version: snapshot.version
  })).digest("base64url");
}

async function cloudFetch(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(cloudSyncRequestTimeoutMs)
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new Error(`Cloud sync request timed out after ${cloudSyncRequestTimeoutMs / 1000} seconds.`);
    }
    throw error;
  }
}

function cloudSyncKeyId(key: Buffer, salt: Buffer): string {
  return `ccr-e2ee-v1-${createHash("sha256").update(salt).update(key).digest("base64url").slice(0, 32)}`;
}

function withCloudSyncSuccess(
  config: AppConfig,
  patch: Pick<CloudSyncConfig, "lastRevision"> & Partial<Pick<CloudSyncConfig, "snapshotHash">>,
  syncedSnapshot?: CloudSyncSnapshot,
  keyMaterial?: CloudSyncKeyMaterial
): AppConfig {
  clearPendingCloudSyncConflict(config);
  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      lastRevision: patch.lastRevision,
      lastSyncedSnapshot: syncedSnapshot
        ? keyMaterial
          ? storedCloudSyncSnapshot(syncedSnapshot, keyMaterial)
          : cloneJson(syncedSnapshot)
        : normalizedCloudSyncConfig(config.cloudSync).lastSyncedSnapshot,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined,
      snapshotHash: patch.snapshotHash
    }
  };
}

function withCloudSyncProbeSuccess(config: AppConfig): AppConfig {
  return {
    ...config,
    cloudSync: {
      ...normalizedCloudSyncConfig(config.cloudSync),
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined
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
      deviceName: normalizedCloudSyncConfig(config.cloudSync).deviceName || defaultDeviceName(),
      lastSyncError: undefined
    }
  };
}

function normalizedCloudSyncConfig(
  config: CloudSyncConfig
): CloudSyncConfig & { scopes: CloudSyncScope[] } {
  return {
    ...config,
    baseUrl: normalizeBaseUrl(config.baseUrl || CLOUD_SYNC_DEFAULT_BASE_URL),
    deviceName: optionalString(config.deviceName) || defaultDeviceName(),
    enabled: Boolean(config.enabled),
    lastRevision: Number.isInteger(config.lastRevision) && config.lastRevision >= 0 ? config.lastRevision : 0,
    lastSyncedSnapshot: isCloudSyncBaselineValue(config.lastSyncedSnapshot)
      ? cloneJson(config.lastSyncedSnapshot)
      : undefined,
    namespace: optionalString(config.namespace) || defaultCloudSyncNamespace,
    scopes: normalizeCloudSyncScopes(config.scopes)
  };
}

function normalizeCloudSyncScopes(value: unknown): CloudSyncScope[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CLOUD_SYNC_SCOPES];
  }
  const allowed = new Set<unknown>(CLOUD_SYNC_SCOPE_IDS);
  return [...new Set(value.filter((item): item is CloudSyncScope => allowed.has(item)))];
}

function normalizeBaseUrl(value: string | undefined): string {
  const raw = requiredString(value, "Cloud sync server URL");
  const url = new URL(raw);
  const loopbackHttp = url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1");
  if (url.protocol !== "https:" && !loopbackHttp) {
    throw new Error("Cloud sync server URL must use HTTPS unless it targets the local machine.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function cloudSyncUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), `${normalizeBaseUrl(baseUrl)}/`).toString();
}

function cloudSyncLoginUrl(baseUrl: string, callbackUrl: string | undefined): string {
  const url = new URL(cloudSyncUrl(baseUrl, "/auth/github/login"));
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
