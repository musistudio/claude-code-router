import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const [outputFile, ...inputFiles] = process.argv.slice(2);

if (!outputFile || inputFiles.length < 2) {
  console.error("Usage: node build/merge-macos-update-metadata.mjs <output> <latest-mac.yml> <latest-mac.yml> [...]");
  process.exit(1);
}

const updateInfos = inputFiles.map((file) => {
  const info = yaml.load(readFileSync(file, "utf8"));
  if (!info || typeof info !== "object") {
    throw new Error(`${file} is not a valid update metadata object`);
  }
  if (!Array.isArray(info.files) || info.files.length === 0) {
    throw new Error(`${file} does not contain any update files`);
  }
  return { file, info };
});

const version = updateInfos[0].info.version;
if (!version || updateInfos.some(({ info }) => info.version !== version)) {
  throw new Error("All macOS update metadata files must have the same version");
}

const files = uniqueByUrl(
  updateInfos
    .flatMap(({ info }) => info.files)
    .filter((file) => file && typeof file.url === "string")
    .sort(compareMacUpdateFile)
);

const defaultZip = files.find((file) => file.url.endsWith(".zip") && file.url.includes("arm64")) ?? files.find((file) => file.url.endsWith(".zip"));
if (!defaultZip?.sha512) {
  throw new Error("Merged macOS update metadata must include at least one ZIP with sha512");
}

const releaseDate = updateInfos
  .map(({ info }) => info.releaseDate)
  .filter(Boolean)
  .sort()
  .at(-1);

const { files: _files, path: _path, sha512: _sha512, releaseDate: _releaseDate, ...baseInfo } = updateInfos[0].info;
const mergedInfo = {
  ...baseInfo,
  version,
  files,
  path: defaultZip.url,
  sha512: defaultZip.sha512,
  ...(releaseDate ? { releaseDate } : {})
};

writeFileSync(outputFile, yaml.dump(mergedInfo, { lineWidth: 120, noRefs: true }), "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outputFile)} with ${files.length} macOS artifacts.`);

function uniqueByUrl(files) {
  const seen = new Set();
  return files.filter((file) => {
    if (seen.has(file.url)) {
      return false;
    }
    seen.add(file.url);
    return true;
  });
}

function compareMacUpdateFile(left, right) {
  return fileRank(left) - fileRank(right) || left.url.localeCompare(right.url);
}

function fileRank(file) {
  const isZip = file.url.endsWith(".zip") ? 0 : 10;
  const isAppleSilicon = file.url.includes("arm64") ? 0 : 1;
  return isZip + isAppleSilicon;
}
