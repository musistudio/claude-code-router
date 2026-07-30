const errors = [];

if (process.platform !== "win32") {
  errors.push(
    [
      "Windows app builds must run on Windows.",
      "This package includes better-sqlite3, and node-gyp cannot cross-compile its native Electron binary from macOS or Linux.",
      "Use a Windows x64 machine or the GitHub Actions Windows release job."
    ].join(" ")
  );
}

if (process.arch !== "x64") {
  errors.push(
    `Windows packaging is configured for x64 NSIS artifacts, but this Node.js process is ${process.arch}. Run the build with x64 Node.js on Windows.`
  );
}

if (errors.length > 0) {
  console.error("Windows packaging preflight failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Windows packaging preflight passed.");
