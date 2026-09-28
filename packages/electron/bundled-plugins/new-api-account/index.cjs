"use strict";

const CONNECTOR_ID = "subscription-self";
const DEFAULT_REFRESH_PATH = "/api/user/auth/refresh";
const DEFAULT_SUBSCRIPTION_PATH = "/api/subscription/self";
const DEFAULT_TIMEOUT_MS = 15000;

module.exports = {
  setup(ctx) {
    ctx.logger?.info?.("new-api account connector registered");
    return {
      providerAccountConnectors: [
        {
          id: CONNECTOR_ID,
          resolve: resolveSubscriptionSelf
        }
      ]
    };
  }
};

async function resolveSubscriptionSelf(request) {
  if (typeof request.fetchProviderAccountJson !== "function") {
    throw new Error("New API account connector requires CCR Desktop browser account fetch support.");
  }

  const options = isRecord(request.connector?.options) ? request.connector.options : {};
  const root = newApiRootBaseUrl(readString(options.baseUrl) || providerBaseUrl(request.provider));
  if (!root) {
    throw new Error("New API provider base URL is missing.");
  }

  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const requestOrigin = readString(options.requestOrigin) || root;
  const refreshPayload = await request.fetchProviderAccountJson({
    body: options.refreshBody ?? {},
    credentials: "include",
    endpoint: rootUrl(root, readString(options.refreshPath) || DEFAULT_REFRESH_PATH),
    headers: readStringRecord(options.refreshHeaders),
    method: "POST",
    requestOrigin,
    timeoutMs
  });
  assertSuccessfulPayload(refreshPayload, "New API refresh");

  const token = refreshTokenFromPayload(refreshPayload);
  if (!token) {
    throw new Error("New API refresh response did not include an access token.");
  }

  const subscriptionPayload = await request.fetchProviderAccountJson({
    credentials: "omit",
    endpoint: rootUrl(root, readString(options.subscriptionPath) || DEFAULT_SUBSCRIPTION_PATH),
    headers: {
      ...readStringRecord(options.subscriptionHeaders),
      authorization: `Bearer ${token}`
    },
    method: "GET",
    requestOrigin,
    timeoutMs
  });
  assertSuccessfulPayload(subscriptionPayload, "New API subscription");

  const meter = subscriptionQuotaMeter(subscriptionPayload, options);
  return {
    message: subscriptionMessage(subscriptionPayload),
    meters: [meter],
    status: subscriptionStatus(subscriptionPayload, meter)
  };
}

function refreshTokenFromPayload(payload) {
  const token = firstString(
    readPath(payload, ["data", "token"]),
    readPath(payload, ["data", "access_token"]),
    readPath(payload, ["data", "accessToken"]),
    readPath(payload, ["data", "auth_token"]),
    readPath(payload, ["data", "jwt"]),
    readPath(payload, ["token"]),
    readPath(payload, ["access_token"]),
    readPath(payload, ["accessToken"]),
    readPath(payload, ["auth_token"]),
    readPath(payload, ["jwt"]),
    isRecord(payload) ? undefined : payload
  );
  return token?.replace(/^Bearer\s+/i, "").trim() || "";
}

function subscriptionQuotaMeter(payload, options) {
  const data = payloadData(payload);
  const remaining = firstNumber(
    readPath(data, ["quota"]),
    readPath(data, ["remaining_quota"]),
    readPath(data, ["remain_quota"]),
    readPath(data, ["available_quota"]),
    readPath(data, ["total_available"]),
    readPath(data, ["balance"])
  );
  const used = firstNumber(
    readPath(data, ["used_quota"]),
    readPath(data, ["total_used"]),
    readPath(data, ["used"])
  );
  const configuredLimit = firstNumber(
    readPath(data, ["total_quota"]),
    readPath(data, ["quota_total"]),
    readPath(data, ["quota_limit"]),
    readPath(data, ["total_granted"]),
    readPath(data, ["limit"])
  );
  const limit = configuredLimit ?? (remaining !== undefined && used !== undefined ? remaining + used : undefined);
  if (remaining === undefined && used === undefined && limit === undefined) {
    throw new Error("New API subscription response did not include quota fields.");
  }

  return {
    id: "new_api_subscription_quota",
    kind: "quota",
    label: readString(options.label) || "Subscription quota",
    limit,
    remaining,
    resetAt: subscriptionResetAt(data),
    unit: readString(options.unit) || "quota",
    used
  };
}

function subscriptionMessage(payload) {
  const data = payloadData(payload);
  return firstString(
    readPath(data, ["plan_name"]),
    readPath(data, ["planName"]),
    readPath(data, ["subscription_name"]),
    readPath(data, ["subscriptionName"]),
    readPath(data, ["name"]),
    readPath(payload, ["message"])
  );
}

function subscriptionStatus(payload, meter) {
  const data = payloadData(payload);
  const status = firstString(readPath(data, ["status"]), readPath(data, ["state"]));
  if (status && /expired|disabled|inactive|cancel/i.test(status)) {
    return "critical";
  }
  if (meter.limit && meter.remaining !== undefined) {
    const ratio = meter.remaining / meter.limit;
    if (ratio <= 0.05) {
      return "critical";
    }
    if (ratio <= 0.2) {
      return "warning";
    }
  }
  return "ok";
}

function subscriptionResetAt(data) {
  const value = firstString(
    readPath(data, ["expired_at"]),
    readPath(data, ["expires_at"]),
    readPath(data, ["expire_at"]),
    readPath(data, ["end_at"]),
    readPath(data, ["valid_until"])
  ) ?? firstNumber(
    readPath(data, ["expired_at"]),
    readPath(data, ["expires_at"]),
    readPath(data, ["expire_at"]),
    readPath(data, ["end_at"]),
    readPath(data, ["valid_until"])
  );
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number") {
    if (value <= 0) {
      return undefined;
    }
    const date = new Date(value > 100000000000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function assertSuccessfulPayload(payload, label) {
  if (!isRecord(payload)) {
    return;
  }
  if (payload.success === false || payload.code === false) {
    throw new Error(`${label} failed${payload.message ? `: ${String(payload.message)}` : ""}.`);
  }
}

function payloadData(payload) {
  return isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
}

function providerBaseUrl(provider) {
  return readString(provider?.api_base_url) || readString(provider?.baseUrl) || readString(provider?.baseurl);
}

function newApiRootBaseUrl(baseUrl) {
  const value = readString(baseUrl);
  if (!value) {
    return "";
  }
  try {
    const url = new URL(providerUrlWithDefaultScheme(value));
    let pathname = url.pathname.replace(/\/+$/, "");
    while (/\/(?:v1|api)$/i.test(pathname)) {
      pathname = pathname.replace(/\/(?:v1|api)$/i, "");
    }
    url.pathname = pathname || "/";
    url.search = "";
    url.hash = "";
    return compactUrl(url);
  } catch {
    let normalized = value.replace(/[?#].*$/, "").replace(/\/+$/, "");
    while (/\/(?:v1|api)$/i.test(normalized)) {
      normalized = normalized.replace(/\/(?:v1|api)$/i, "");
    }
    return normalized;
  }
}

function rootUrl(root, endpointPath) {
  const normalizedPath = `/${readString(endpointPath).replace(/^\/+/, "")}`;
  return `${root.replace(/\/+$/, "")}${normalizedPath}`;
}

function compactUrl(url) {
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname && pathname !== "/" ? pathname : ""}`;
}

function providerUrlWithDefaultScheme(value) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

function normalizeTimeoutMs(value) {
  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(timeoutMs, 1000), 60000);
}

function readStringRecord(value) {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key.trim(), readString(item)])
      .filter(([key, item]) => key && item)
  );
}

function readPath(value, path) {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function firstString(...values) {
  for (const value of values) {
    const text = readString(value);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = readNumber(value);
    if (number !== undefined) {
      return number;
    }
  }
  return undefined;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
