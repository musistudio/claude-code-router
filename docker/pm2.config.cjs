const noGateway = /^(1|true|yes)$/i.test(process.env.CCR_NO_GATEWAY || "");
const serverArgs = [
  "--host",
  process.env.CCR_WEB_HOST || "127.0.0.1",
  "--port",
  process.env.CCR_WEB_PORT || "3459",
  "--no-open"
];

if (noGateway) {
  serverArgs.push("--no-gateway");
}

module.exports = {
  apps: [
    {
      name: "ccr-core-server",
      script: "/app/packages/core/dist/main/server.js",
      args: serverArgs,
      cwd: "/app",
      interpreter: "node",
      env: {
        ...process.env,
        NODE_ENV: "production"
      }
    },
    {
      name: "ccr-nginx",
      script: "/usr/sbin/nginx",
      args: ["-g", "daemon off;"],
      cwd: "/app",
      interpreter: "none"
    }
  ]
};
