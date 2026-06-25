const fs = require("node:fs");
const path = require("node:path");

module.exports = async function verifyUpdateMetadata(buildResult) {
  const artifactPaths = Array.isArray(buildResult?.artifactPaths) ? buildResult.artifactPaths : [];
  const outputDirs = new Set(artifactPaths.map((artifactPath) => path.dirname(artifactPath)));
  const metadataFiles = artifactPaths.filter((artifactPath) => /^latest(?:-[a-z]+)?\.ya?ml$/i.test(path.basename(artifactPath)));

  for (const outputDir of outputDirs) {
    for (const filename of fs.readdirSync(outputDir)) {
      const candidate = path.join(outputDir, filename);
      if (/^latest(?:-[a-z]+)?\.ya?ml$/i.test(filename) && !metadataFiles.includes(candidate)) {
        metadataFiles.push(candidate);
      }
    }
  }

  const errors = [];
  for (const metadataFile of metadataFiles) {
    const metadataDir = path.dirname(metadataFile);
    const metadata = fs.readFileSync(metadataFile, "utf8");
    for (const artifact of readReferencedArtifacts(metadata)) {
      if (isRemoteUrl(artifact)) {
        continue;
      }
      const artifactPath = path.resolve(metadataDir, artifact);
      if (!fs.existsSync(artifactPath)) {
        errors.push(`${path.relative(process.cwd(), metadataFile)} references missing artifact ${artifact}`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Update metadata validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
};

function readReferencedArtifacts(metadata) {
  const values = new Set();
  for (const line of metadata.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:path|url):\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const value = match[1].replace(/^['"]|['"]$/g, "").trim();
    if (value) {
      values.add(value);
    }
  }
  return [...values];
}

function isRemoteUrl(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}
