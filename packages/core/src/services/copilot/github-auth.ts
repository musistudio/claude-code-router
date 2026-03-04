import {
  GITHUB_BASE_URL,
  GITHUB_CLIENT_ID,
  GITHUB_APP_SCOPES,
  standardHeaders,
} from "./api-config";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function getDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(`${GITHUB_BASE_URL}/login/device/code`, {
    method: "POST",
    headers: standardHeaders(),
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_APP_SCOPES,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get device code: ${response.status}`);
  }

  return response.json();
}

export async function pollAccessToken(
  deviceCode: string,
  interval: number = 5,
  expiresAt: number
): Promise<string> {
  const pollInterval = (interval + 1) * 1000;

  while (Date.now() < expiresAt) {
    const response = await fetch(
      `${GITHUB_BASE_URL}/login/oauth/access_token`,
      {
        method: "POST",
        headers: standardHeaders(),
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      }
    );

    if (response.ok) {
      const json = await response.json();
      if (json.access_token) {
        return json.access_token;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Device code expired. Please try again.");
}
