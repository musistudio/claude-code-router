# CCR Login Import Chrome Extension

This unpacked Chrome extension imports cookies and localStorage for explicitly selected domains into CCR's in-app browser.

## Development install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extension/chrome` directory.

After changing extension files, click **Reload** for this unpacked extension in `chrome://extensions`.
The confirmation-page flow uses the site access declared in `manifest.json`; it does not request new host permissions from the page click.

## Flow

1. An agent calls CCR's Chrome login import browser tool, or the user clicks the key button in CCR's in-app browser.
2. CCR opens a one-time confirmation page in the system browser.
3. Review the requested domains and click **Confirm and Import**.

The extension reads only the domains listed in the CCR job. It does not enumerate all Chrome cookies.

For localStorage, the extension temporarily opens non-active tabs for the selected origins, reads `localStorage`, then closes those tabs.
