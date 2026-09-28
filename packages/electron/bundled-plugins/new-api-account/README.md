# New API Account Plugin

This CCR Desktop plugin registers a provider account connector for New API user subscription quota.

It uses the built-in browser session so the refresh request can include the user's New API cookies:

1. `POST {newapi-baseurl}/api/user/auth/refresh` with browser `credentials: "include"`.
2. Read the returned access token.
3. `GET {newapi-baseurl}/api/subscription/self` with `authorization: Bearer <token>`.

## Install

Open **Extensions**, install a local extension, and choose this `plugins/new-api-account` directory.

## Provider Connector

Add this connector to the New API provider's account connector JSON:

```json
[
  {
    "type": "plugin",
    "pluginId": "new-api-account",
    "connectorId": "subscription-self"
  }
]
```

The plugin derives `{newapi-baseurl}` from the provider base URL by removing trailing `/v1` or `/api`.

Optional connector settings:

```json
[
  {
    "type": "plugin",
    "pluginId": "new-api-account",
    "connectorId": "subscription-self",
    "options": {
      "timeoutMs": 15000,
      "refreshPath": "/api/user/auth/refresh",
      "subscriptionPath": "/api/subscription/self",
      "unit": "quota",
      "label": "Subscription quota"
    }
  }
]
```

The account must already be signed in inside CCR Desktop's built-in browser for the refresh endpoint to receive cookies.
