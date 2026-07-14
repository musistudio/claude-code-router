# Client IP Observability Design

## Goal

Add client-IP usage filtering and request-level visibility without changing the
existing model-statistics semantics. Remove the in-progress Fusion model,
observed-model, and routed-model attribution additions from this branch.

## Scope

The pull request keeps only the client-IP feature:

- Capture a normalized client IP at the gateway boundary.
- Persist it in request logs and usage events with backward-compatible SQLite
  migrations.
- Aggregate and filter usage by client IP.
- Add an IP selector to Overview.
- Show the stored IP in Observability and Logs request lists and details.
- Show an em dash for legacy records that have no stored IP.

The pull request explicitly excludes:

- Fusion model persistence, aggregation, filtering, or widgets.
- Observed model-name option discovery.
- Changes to upstream-response versus routed-model attribution.
- Destructive history rewrites.

CCR's existing model distribution and model filter remain unchanged.

## Data Flow

1. The gateway reads the peer address from the request socket before routing.
2. IPv4-mapped IPv6 is normalized to IPv4. Other IPv4 and IPv6 addresses are
   validated with Node's IP parser.
3. Forwarded headers are trusted only when the immediate peer is loopback. In
   that case `X-Real-IP` is preferred, followed by the first
   `X-Forwarded-For` entry. Invalid forwarded values fall back to the socket
   address.
4. The normalized value is passed independently to request-log and usage
   recording. No UI layer reparses headers.
5. SQLite stores the value in nullable-by-convention, non-null text columns
   whose empty string represents unavailable legacy data.
6. Usage queries may filter on `client_ip`; Overview receives an IP option set
   that ignores only the active IP filter while retaining the current time,
   provider, model, credential, and proxy scope.
7. Observability and Logs render the stored value directly.

## Compatibility and Security

- Existing databases gain `client_ip TEXT NOT NULL DEFAULT ''` through schema
  checks and `ALTER TABLE`.
- Request-log-to-usage backfill checks whether the source schema contains the
  new column before selecting it.
- Arbitrary remote clients cannot spoof `X-Real-IP` or `X-Forwarded-For` because
  forwarded headers are ignored unless the direct peer is loopback.
- No historical IP is inferred or backfilled.

## UI Behavior

- Overview adds an `All IPs` selector alongside existing provider/model
  selectors.
- Selecting an IP filters the complete usage snapshot.
- The available IP list remains stable under its own filter and updates when
  other filters or the range change.
- Observability request tables and Logs list/detail display `Client IP`.
- Missing values render as `—`.
- English and Chinese labels are provided.

## Verification

- Unit tests cover socket/forwarded-header trust, IP validation, and address
  normalization.
- Store tests cover schema migration, old request-log backfill, IP aggregation,
  filtering, and option stability under an active IP filter.
- Renderer tests cover Overview filtering and both collapsed and expanded
  request IP displays.
- Run targeted tests, complete main and renderer suites, TypeScript typecheck,
  and `git diff --check` before opening the pull request.

## Pull Request Boundary

Only product code, tests, and this design document are committed. CCB state and
root-level temporary planning files are excluded. The PR is created from a
dedicated feature branch against `origin/main`.
