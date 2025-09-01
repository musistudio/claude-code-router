# Changelog

## [1.0.0] - 2025-09-01

### Added

- **New Backend API:** A new backend API has been introduced to support the new widgets. The API provides endpoints for managing and monitoring the various widgets in the dashboard. See the [API Guide](API_GUIDE.md) for more details.
- **New Widgets:** The following new widgets have been added to the dashboard:
  - **System Health Checker:** Provides a real-time overview of your system's health.
  - **Cost Optimizer:** Helps you optimize your costs by providing recommendations for cost savings.
  - **Performance Alert:** Alerts you to performance issues that may affect your services.
  - **Route Monitor:** Tracks requests on each route and monitors the models being used.
  - **Provider Manager:** Allows you to manage your AI providers.
  - **Cost & Usage Forecast:** Provides a forecast of your costs and usage based on historical data.
  - **Provider Timeline:** Provides a visual timeline of significant events for each provider.

### Changed

- **Widget Transformation:** The existing widgets have been replaced with new, more powerful and user-friendly widgets. The following widgets have been replaced:
  - `LiveActivityFeed` has been replaced with `System Health Checker`.
  - `ModelPerformanceLeaderboard` has been replaced with `Cost Optimizer`.
  - `ProviderHealthManagement` has been replaced with `Provider Manager`.
  - `ThreatMatrix` has been replaced with `Performance Alert`.
  - `RouteEfficiencyMatrix` has been replaced with `Route Monitor`.
  - `ProviderHealthHistory` has been replaced with `Provider Timeline`.
  - `HistoricalPerformanceGraphs` has been replaced with `Cost & Usage Forecast`.

### Removed

- The following old widgets have been removed from the dashboard:
  - `LiveActivityFeed`
  - `ModelPerformanceLeaderboard`
  - `ProviderHealthManagement`
  - `ThreatMatrix`
  - `RouteEfficiencyMatrix`
  - `ProviderHealthHistory`
  - `HistoricalPerformanceGraphs`
