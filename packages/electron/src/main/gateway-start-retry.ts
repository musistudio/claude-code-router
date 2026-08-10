import { NO_AVAILABLE_GATEWAY_MODELS_MESSAGE } from "@ccr/core/contracts/app";
import type { AppConfig, GatewayStatus } from "@ccr/core/contracts/app";

/**
 * The first gateway start after a machine boots competes with every other login item for disk and
 * CPU, so the managed core runtime regularly misses its health deadline even though the
 * configuration is sound. Retry those failures with growing gaps instead of leaving the app in the
 * error state until someone starts the gateway by hand.
 */
export const gatewayStartRetryDelaysMs = [2_000, 5_000, 10_000];

const permanentGatewayStartErrors = [
  NO_AVAILABLE_GATEWAY_MODELS_MESSAGE,
  "Core gateway host must be 127.0.0.1 or ::1."
];

export type GatewayStartRetryOptions = {
  getStatus: () => GatewayStatus;
  onRetry?: (attempt: number, delayMs: number, lastError: string | undefined) => void;
  shouldAbort?: () => boolean;
  start: (config: AppConfig) => Promise<GatewayStatus>;
  wait?: (ms: number) => Promise<void>;
};

export function isRetryableGatewayStartFailure(status: GatewayStatus): boolean {
  if (status.state !== "error") {
    return false;
  }

  const message = status.lastError ?? "";
  return !permanentGatewayStartErrors.some((permanent) => message.includes(permanent));
}

export async function startGatewayWithRetry(
  config: AppConfig,
  options: GatewayStartRetryOptions
): Promise<GatewayStatus> {
  const wait = options.wait ?? waitFor;
  const shouldAbort = options.shouldAbort ?? (() => false);
  let status = await options.start(config);

  for (const [index, delayMs] of gatewayStartRetryDelaysMs.entries()) {
    if (!isRetryableGatewayStartFailure(status) || shouldAbort()) {
      return status;
    }

    options.onRetry?.(index + 1, delayMs, status.lastError);
    await wait(delayMs);
    if (shouldAbort()) {
      return status;
    }

    // Anything other than the failure we just produced means another caller took over the
    // gateway while we waited, so leave their result alone.
    const current = options.getStatus();
    if (current.state !== "error") {
      return current;
    }

    status = await options.start(config);
  }

  return status;
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
