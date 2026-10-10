import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("#1835 shipped Compose binds management to loopback by default", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");
  assert.match(compose, /127\.0\.0\.1:3458:8080/);
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.match(scripts["docker:run"], /-p 127\.0\.0\.1:3458:8080/);
});

test("#1835 generated Nginx config forwards browser sources without forging them", () => {
  const entrypoint = readFileSync("docker/entrypoint.sh", "utf8");
  const template = entrypoint.split("cat > /etc/nginx/conf.d/default.conf <<EOF\n")[1].split("\nEOF")[0];
  const rendered = spawnSync("sh", ["-c", `cat <<EOF\n${template}\nEOF`], {
    encoding: "utf8", env: { CCR_WEB_HOST: "127.0.0.1", CCR_WEB_PORT: "3459", CCR_NGINX_PORT: "8080", CCR_GATEWAY_HOST: "127.0.0.1", CCR_GATEWAY_PORT: "3456", CCR_WEB_AUTH_TOKEN_QUERY: "private-token" }
  });
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /proxy_set_header Origin \$http_origin;/);
  assert.match(rendered.stdout, /proxy_set_header Referer \$http_referer;/);
  assert.doesNotMatch(rendered.stdout, /private-token/);
});
