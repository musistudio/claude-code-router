const { execFileSync } = require("node:child_process");
const path = require("node:path");

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

module.exports = async function verifyMacosNotarization(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (process.env.CCR_SKIP_MAC_NOTARIZATION_VERIFY === "1") {
    console.warn("Skipping macOS notarization verification because CCR_SKIP_MAC_NOTARIZATION_VERIFY=1.");
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  run("xcrun", ["stapler", "validate", appPath]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
};
