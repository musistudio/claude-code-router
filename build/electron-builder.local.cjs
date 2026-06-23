const baseConfig = require("../electron-builder.json");

const config = {
  ...baseConfig,
  directories: {
    ...baseConfig.directories,
    output: "release-local"
  },
  mac: {
    ...baseConfig.mac,
    identity: "-",
    notarize: false,
    forceCodeSigning: false
  }
};

delete config.afterSign;

module.exports = config;
