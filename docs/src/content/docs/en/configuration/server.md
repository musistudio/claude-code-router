---
title: Server
pageTitle: Server
eyebrow: Detailed configuration
lead: Configure the CCR gateway host, port, and Proxy mode for MITM interception and proxying into CCR.
---

## Management and gateway addresses are separate

The Host/Port fields under **Server** configure the model gateway. The browser management page uses a separate address and port:

| Distribution | Management entry | Model gateway |
| --- | --- | --- |
| Desktop | App window | `http://127.0.0.1:3456` by default |
| npm CLI | `http://127.0.0.1:3458` by default | `http://127.0.0.1:3456` by default |
| Docker | Public `http://127.0.0.1:3458` by default | Combined into the same public Nginx endpoint |

CLI `--host`/`--port` options configure management; this page configures the gateway. Docker internal listeners should not be published separately. See [Docker Deployment](../../guides/docker/).

## Main fields

| Field | Capability |
| --- | --- |
| Host | Host address the CCR gateway listens on. Common values are `127.0.0.1` and `0.0.0.0`. |
| Port | Gateway listening port. Clients should point their API base URL to this port. |

`127.0.0.1` allows local access only; `0.0.0.0` listens on every IPv4 interface. Use a wildcard only for intentional LAN/remote access, together with CCR client API keys, firewall/private-network controls, and TLS at a reverse proxy.

Management tokens, CCR client API keys, and upstream credentials are separate. Gateway clients use keys created under **API Keys** and should never receive upstream provider credentials.

## Start and verify

1. Add at least one provider and model.
2. Create a client key under **API Keys**.
3. Click **Start** or **Restart**.
4. Confirm Running status and request the gateway `/health` route.
5. Send a minimal model request and inspect the resolved provider/model under Logs.

A reachable management UI does not prove the gateway is running. Docker returns `502` from `/health` until the gateway starts, and desktop/CLI can keep management available without usable models.

## Proxy mode

Proxy mode is the local proxy capability. When enabled, clients can send HTTP/HTTPS traffic to CCR. CCR uses MITM interception to identify and decrypt HTTPS requests, then proxies supported model requests into the CCR gateway path.

| Field | Capability |
| --- | --- |
| Proxy mode | Enables Proxy mode. CCR can receive client traffic as an HTTP/HTTPS proxy and use MITM interception to proxy model requests into CCR. |
| System proxy | Points the system proxy at CCR so apps that honor system proxy settings can go through CCR automatically. |
| Capture network | Stores network requests that pass through proxy mode so the Networking page can show request and response details. |
| CA certificate | Trust status of the current proxy CA certificate. |
| Install CA | Installs the CCR proxy CA into the system or user trust store. Installation differs by OS. |
| Check Trust | Checks again whether the proxy CA is trusted by the system. |
| Proxy status | Shows whether the proxy service is running. |
| Restart Proxy | Restarts the proxy service when proxy mode is enabled. |

Proxy mode changes local networking and certificate trust and is primarily a desktop feature. Container deployments should normally point clients directly at the public CCR Nginx gateway; changing the host system proxy or installing a host CA from inside the container is not supported.
