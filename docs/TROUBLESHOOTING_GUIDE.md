# Troubleshooting Guide

This guide provides solutions to common issues you might encounter with the new widgets and API.

## Common Issues

### 1. Widget data is not loading or seems outdated.

- **Check your network connection:** Ensure you have a stable internet connection.
- **Refresh the widget:** Use the refresh button available on some widgets, or refresh the entire page.
- **Check Provider Status:** Look at the **Provider Manager** widget to see if there are any reported outages or performance issues with your current AI provider.

### 2. API requests are failing.

- **Consult the API Guide:** Double-check the [API_GUIDE.md](API_GUIDE.md) to ensure you are using the correct endpoint and request format.
- **Check for Performance Alerts:** The **Performance Alert** widget may have information about issues like rate limiting that could be causing requests to fail.

### 3. Cost optimization recommendations are not being applied.

- **Confirm the Action:** Ensure you have clicked the "Apply" or "Apply All" button in the **Cost Optimizer** widget.
- **Check for Conflicts:** There might be conflicting settings in your route configurations. Review the settings in the **Route Monitor** widget.

### 4. Unable to switch between providers.

- **Test the Connection:** In the **Provider Manager** widget, use the "Test Connection" button for the provider you want to switch to. This will help determine if the provider is reachable.
- **Check Health History:** Review the **Provider Timeline** to see if the provider has a history of recent downtime.

### 5. Data in the Cost & Usage Forecast seems inaccurate.

- **Allow Time for Data Collection:** The forecast becomes more accurate as it collects more data over time. If you have just started using the system, the predictions may be less precise.
- **Check for Anomalies:** Unusual usage patterns can affect the forecast. Review the **Route Monitor** for any unexpected activity.

## Contact Support

If you are still experiencing issues after consulting this guide, please contact the support team for further assistance.
