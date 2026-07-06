const fs = require("node:fs");
const path = require("node:path");

const betterSqliteNativeRelativePath = path.join(
  "app.asar.unpacked",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);
const betterSqlitePackageRelativePath = path.join("app.asar.unpacked", "node_modules", "better-sqlite3");
const betterSqlitePrunablePaths = [
  "deps",
  "src",
  "binding.gyp",
  "README.md",
  "docs",
  "benchmark",
  "benchmarks",
  "test",
  path.join("build", "Release", "obj"),
  path.join("build", "Release", "obj.target")
];

module.exports = async function verifyPackagedApp(context) {
  const platform = context?.electronPlatformName;
  const arch = normalizeArch(context?.arch);
  const appOutDir = context?.appOutDir;

  if (!platform || !appOutDir) {
    throw new Error("Packaged app verification did not receive electron-builder platform context.");
  }

  const resourcesDir = findResourcesDir(appOutDir, platform);
  assertFile(path.join(resourcesDir, "app.asar"), "Packaged app archive");
  cleanupBetterSqlitePackage(resourcesDir);

  const nativeModule = path.join(resourcesDir, betterSqliteNativeRelativePath);
  assertFile(nativeModule, "better-sqlite3 native module");

  const nativeInfo = inspectNativeModule(nativeModule);
  if (nativeInfo.platform !== platform) {
    throw new Error(
      `Packaged better-sqlite3 native module targets ${formatNativeInfo(nativeInfo)}, ` +
        `but electron-builder is packaging ${platform}/${arch}. Rebuild native dependencies for the target platform before packaging.`
    );
  }

  if (arch && !nativeArchMatches(nativeInfo, arch)) {
    throw new Error(
      `Packaged better-sqlite3 native module targets ${formatNativeInfo(nativeInfo)}, ` +
        `but electron-builder is packaging ${platform}/${arch}. Run npm run rebuild:sqlite3 on the target platform before packaging.`
    );
  }
};

function cleanupBetterSqlitePackage(resourcesDir) {
  const packageDir = path.join(resourcesDir, betterSqlitePackageRelativePath);
  for (const relativePath of betterSqlitePrunablePaths) {
    fs.rmSync(path.join(packageDir, relativePath), { force: true, recursive: true });
  }
}

function findResourcesDir(appOutDir, platform) {
  if (platform !== "darwin") {
    return path.join(appOutDir, "resources");
  }

  const appBundle = fs.readdirSync(appOutDir)
    .find((entry) => entry.endsWith(".app") && fs.statSync(path.join(appOutDir, entry)).isDirectory());
  if (!appBundle) {
    throw new Error(`Could not find a .app bundle in ${appOutDir}`);
  }
  return path.join(appOutDir, appBundle, "Contents", "Resources");
}

function assertFile(file, label) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new Error(`${label} is missing: ${file}`);
  }

  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${label} is empty or not a file: ${file}`);
  }
}

function inspectNativeModule(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 32) {
    throw new Error(`Native module is too small to identify: ${file}`);
  }

  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return inspectPe(buffer, file);
  }
  if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return inspectElf(buffer);
  }

  const magicLe = buffer.readUInt32LE(0);
  const magicBe = buffer.readUInt32BE(0);
  if (magicLe === 0xfeedface || magicLe === 0xfeedfacf || magicLe === 0xcefaedfe || magicLe === 0xcffaedfe) {
    return inspectMachO(buffer, magicLe);
  }
  if (magicBe === 0xcafebabe || magicBe === 0xcafebabf) {
    return inspectFatMachO(buffer, magicBe);
  }

  throw new Error(`Native module has an unknown binary format: ${file}`);
}

function inspectPe(buffer, file) {
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 >= buffer.length || buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error(`Native module has an invalid PE header: ${file}`);
  }
  const machine = buffer.readUInt16LE(peOffset + 4);
  return {
    arch: peMachineArch(machine),
    platform: "win32"
  };
}

function inspectElf(buffer) {
  const machine = buffer.readUInt16LE(18);
  return {
    arch: elfMachineArch(machine),
    platform: "linux"
  };
}

function inspectMachO(buffer, magicLe) {
  const bigEndian = magicLe === 0xcefaedfe || magicLe === 0xcffaedfe;
  const cpuType = bigEndian ? buffer.readUInt32BE(4) : buffer.readUInt32LE(4);
  return {
    arch: machCpuArch(cpuType),
    platform: "darwin"
  };
}

function inspectFatMachO(buffer, magicBe) {
  const archs = [];
  const count = buffer.readUInt32BE(4);
  const entrySize = magicBe === 0xcafebabf ? 32 : 20;
  for (let index = 0; index < count; index += 1) {
    const offset = 8 + index * entrySize;
    if (offset + 8 > buffer.length) {
      break;
    }
    archs.push(machCpuArch(buffer.readUInt32BE(offset)));
  }
  return {
    arch: "universal",
    archs,
    platform: "darwin"
  };
}

function peMachineArch(machine) {
  if (machine === 0x8664) {
    return "x64";
  }
  if (machine === 0xaa64) {
    return "arm64";
  }
  if (machine === 0x014c) {
    return "ia32";
  }
  return `unknown-pe-${machine.toString(16)}`;
}

function elfMachineArch(machine) {
  if (machine === 0x3e) {
    return "x64";
  }
  if (machine === 0xb7) {
    return "arm64";
  }
  if (machine === 0x03) {
    return "ia32";
  }
  if (machine === 0x28) {
    return "armv7l";
  }
  return `unknown-elf-${machine.toString(16)}`;
}

function machCpuArch(cpuType) {
  if (cpuType === 0x01000007) {
    return "x64";
  }
  if (cpuType === 0x0100000c) {
    return "arm64";
  }
  if (cpuType === 0x00000007) {
    return "ia32";
  }
  return `unknown-macho-${cpuType.toString(16)}`;
}

function normalizeArch(arch) {
  if (typeof arch === "string") {
    return arch;
  }
  const electronBuilderArchNames = new Map([
    [0, "ia32"],
    [1, "x64"],
    [2, "armv7l"],
    [3, "arm64"],
    [4, "universal"]
  ]);
  return electronBuilderArchNames.get(arch);
}

function nativeArchMatches(info, arch) {
  if (info.arch === arch) {
    return true;
  }
  if (info.arch === "universal") {
    return arch === "universal" || Boolean(info.archs?.includes(arch));
  }
  return false;
}

function formatNativeInfo(info) {
  return info.arch === "universal" && info.archs?.length
    ? `${info.platform}/${info.arch} (${info.archs.join(", ")})`
    : `${info.platform}/${info.arch}`;
}
