import {
  getDeviceCode,
  pollAccessToken,
} from "../services/copilot/github-auth";
import { getCopilotToken, saveCopilotToken } from "../services/copilot/token";

export async function runAuthCopilot(accountType: string = "individual", force: boolean = false): Promise<void> {
  console.log(`Authenticating with GitHub Copilot (${accountType})...`);

  try {
    // Step 1: Get device code
    console.log("Requesting device code from GitHub...");
    const deviceCode = await getDeviceCode();

    console.log("");
    console.log("╔════════════════════════════════════════════════════╗");
    console.log("║         GitHub Copilot Authentication              ║");
    console.log("╠════════════════════════════════════════════════════╣");
    console.log(`║  Enter this code: ${deviceCode.user_code.padEnd(20)}║`);
    console.log(
      `║  At: ${deviceCode.verification_uri.padEnd(33)}║`
    );
    console.log(`║  Expires in: ${deviceCode.expires_in} seconds                      ║`);
    console.log("╚════════════════════════════════════════════════════╝");
    console.log("");

    // Step 2: Poll for access token
    console.log("Waiting for authorization...");
    const githubToken = await pollAccessToken(
      deviceCode.device_code,
      deviceCode.interval,
      Date.now() + deviceCode.expires_in * 1000
    );

    console.log("GitHub authorization successful!");

    // Step 3: Get Copilot token
    console.log("Exchanging for Copilot token...");
    const copilotToken = await getCopilotToken(githubToken);

    // Step 4: Save tokens
    await saveCopilotToken({
      githubToken,
      copilotToken: copilotToken.token,
      expiresAt: copilotToken.expires_at,
      refreshIn: copilotToken.refresh_in,
      accountType,
    });

    console.log("Copilot authentication complete!");
    console.log(`Token expires at: ${new Date(copilotToken.expires_at * 1000).toLocaleString()}`);
    console.log(`Auto-refresh in: ${copilotToken.refreshIn - 60} seconds`);
  } catch (error) {
    console.error("Authentication failed:", error);
    process.exit(1);
  }
}
