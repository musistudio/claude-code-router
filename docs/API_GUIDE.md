# Widget API Documentation

## Introduction

This document provides detailed documentation for the backend API of the Widget Transformation Project. The API provides endpoints for managing and monitoring the various widgets in the dashboard.

## API Endpoints

### Route Monitoring

#### GET /api/v1/routes/usage

- **Summary:** Get route usage data.
- **Response:**
  - `200 OK`: A list of route usage data.
  - **Schema:** `array` of `RouteData`
```json
[
  {
    "route": "default",
    "requests": 150,
    "configuredModel": "gpt-4",
    "actualModel": "gpt-4",
    "cost": 1.25,
    "avgResponseTime": 250,
    "successRate": 0.98,
    "recentLogs": [],
    "status": "active"
  }
]
```

#### GET /api/v1/routes/models

- **Summary:** Get model usage tracking.
- **Response:**
  - `200 OK`: A list of model usage data.
  - **Schema:** `array` of `RouteData`

#### POST /api/v1/routes/configure

- **Summary:** Configure a route.
- **Response:**
  - `200 OK`: Route configured successfully.

### Cost Optimization

#### GET /api/v1/cost/optimizations

- **Summary:** Get cost optimization suggestions.
- **Response:**
  - `200 OK`: A list of cost optimization suggestions.
  - **Schema:** `CostOptimization`
```json
{
  "totalSavings": 147.00,
  "recommendations": [
    {
      "id": "rec-1",
      "title": "Use claude-haiku instead of gpt-4",
      "description": "Switching to a more cost-effective model for the 'background' route can significantly reduce costs.",
      "savings": 89.00,
      "action": "auto-apply",
      "status": "pending"
    }
  ],
  "currentMonthlyCost": 500.00,
  "projectedMonthlyCost": 353.00
}
```

#### POST /api/v1/cost/apply-optimization

- **Summary:** Apply cost savings.
- **Response:**
  - `200 OK`: Cost savings applied successfully.

### Performance

#### GET /api/v1/performance/alerts

- **Summary:** Get performance alerts.
- **Response:**
  - `200 OK`: A list of performance alerts.
  - **Schema:** `array` of `PerformanceAlert`
```json
[
  {
    "id": "alert-1",
    "severity": "critical",
    "title": "RATE LIMIT APPROACHING",
    "description": "Rate limit at 85% capacity.",
    "action": "Increase limit or add delay.",
    "impact": "Requests will be rejected in approximately 12 minutes.",
    "timestamp": "2025-09-01T14:23:00Z",
    "resolved": false
  }
]
```

#### POST /api/v1/performance/resolve-alert

- **Summary:** Resolve alerts.
- **Response:**
  - `200 OK`: Alert resolved successfully.

### Providers

#### GET /api/v1/providers/health-check

- **Summary:** Provider health check.
- **Response:**
  - `200 OK`: Provider health check status.

#### POST /api/v1/providers/switch

- **Summary:** Switch provider.
- **Response:**
  - `200 OK`: Provider switched successfully.

### Forecast

#### GET /api/v1/forecast/cost-usage

- **Summary:** Cost and usage forecast.
- **Response:**
  - `200 OK`: Cost and usage forecast data.

## Schemas

### RouteData

| Name | Type | Description |
|---|---|---|
| route | string | The name of the route. |
| requests | integer | The number of requests for this route. |
| configuredModel | string | The model configured for this route. |
| actualModel | string | The model actually used for this route. |
| cost | number | The cost associated with this route. |
| avgResponseTime | number | The average response time in milliseconds. |
| successRate | number | The success rate of requests on this route. |
| recentLogs | array | An array of recent activity logs. |
| status | string | The current status of the route. |

### CostOptimization

| Name | Type | Description |
|---|---|---|
| totalSavings | number | The total estimated monthly savings. |
| recommendations | array | An array of optimization recommendations. |
| currentMonthlyCost | number | The current monthly cost. |
| projectedMonthlyCost | number | The projected monthly cost after optimizations. |

### OptimizationRecommendation

| Name | Type | Description |
|---|---|---|
| id | string | The ID of the recommendation. |
| title | string | The title of the recommendation. |
| description | string | A description of the recommendation. |
| savings | number | The estimated monthly savings for this recommendation. |
| action | string | The type of action required to apply the recommendation. |
| status | string | The status of the recommendation. |

### PerformanceAlert

| Name | Type | Description |
|---|---|---|
| id | string | The ID of the alert. |
| severity | string | The severity of the alert. |
| title | string | The title of the alert. |
| description | string | A description of the alert. |
| action | string | The recommended action to resolve the alert. |
| impact | string | The potential impact if the alert is not resolved. |
| timestamp | string | The timestamp of when the alert was generated. |
| resolved | boolean | Whether the alert has been resolved. |
