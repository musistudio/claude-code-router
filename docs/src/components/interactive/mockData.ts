/**
 * Real data fixtures exported from a running local CCR instance via the
 * management RPC. NOT mocked — these are actual request logs and agent
 * analysis snapshots captured from the app.
 */
import type { AgentAnalysisSnapshot, RequestLogPage } from "@ccr/core/contracts/app";

import requestLogsFixture from "./fixtures-request-logs.json";
import agentAnalysisFixture from "./fixtures-agent-analysis.json";

export function getRequestLogData(): RequestLogPage {
  return requestLogsFixture as unknown as RequestLogPage;
}

export function getAgentAnalysisData(): AgentAnalysisSnapshot {
  return agentAnalysisFixture as unknown as AgentAnalysisSnapshot;
}
