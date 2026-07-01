---
title: Server
pageTitle: Server
eyebrow: Detailed Configuration
lead: Configure the CCR gateway host, port, and Proxy mode for MITM interception and proxying into CCR.
---

## Main Fields

| Field | Capability |
| --- | --- |
| Host | Host address the CCR gateway listens on. Common values are `127.0.0.1` and `0.0.0.0`. |
| Port | Gateway listening port. Clients should point their API base URL to this port. |

## Proxy Mode

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
