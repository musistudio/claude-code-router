import { execFileSync } from "node:child_process";

const errors = [];

function reportAndExit() {
  if (errors.length === 0) {
    return;
  }

  console.error("macOS release preflight failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    const stdout = error.stdout?.toString().trim();
    const details = stderr || stdout || error.message;
    errors.push(`cannot run ${command} ${args.join(" ")}: ${details}`);
    return "";
  }
}

function hasCompleteNotaryCredentials() {
  const hasAppPassword =
    Boolean(process.env.APPLE_ID) &&
    Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
    Boolean(process.env.APPLE_TEAM_ID);

  const hasApiKey =
    Boolean(process.env.APPLE_API_KEY) &&
    Boolean(process.env.APPLE_API_KEY_ID) &&
    Boolean(process.env.APPLE_API_ISSUER);

  const hasKeychainProfile = Boolean(process.env.APPLE_KEYCHAIN_PROFILE);

  return hasAppPassword || hasApiKey || hasKeychainProfile;
}

if (process.platform !== "darwin") {
  errors.push("macOS release builds must run on macOS.");
  reportAndExit();
}

const developerDir = run("xcode-select", ["-p"]).trim();
if (developerDir.endsWith("/CommandLineTools")) {
  errors.push("notarization stapling requires full Xcode. Install Xcode and run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.");
}

run("xcrun", ["notarytool", "--version"]);
run("xcrun", ["-f", "stapler"]);

if (!process.env.CSC_LINK) {
  const identities = run("security", ["find-identity", "-v", "-p", "codesigning"]);
  if (!/"Developer ID Application: .+ \([A-Z0-9]+\)"/.test(identities)) {
    errors.push("no Developer ID Application signing identity was found in the keychain. Install a Developer ID Application certificate or provide CSC_LINK/CSC_KEY_PASSWORD.");
  }
}

if (!hasCompleteNotaryCredentials()) {
  errors.push(
    "missing notarization credentials. Set APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER, or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_KEYCHAIN_PROFILE."
  );
}

reportAndExit();
console.log("macOS release preflight passed.");
