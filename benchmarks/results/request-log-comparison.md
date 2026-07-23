# Request log performance comparison

Environment: Apple arm64, Electron Node v24.16.0, SQLite WAL, identical benchmark scenarios and batch sizes.

| Scenario | Metric | Baseline | Optimized | Change |
| --- | ---: | ---: | ---: | ---: |
| Small, no trace | Request-path throughput | 9,949 records/s | 173,695 records/s | 17.5x |
| Small, no trace | Durable throughput | 9,949 records/s | 34,267 records/s | 3.4x |
| Small, no trace | Event-loop p99 | 4.24 ms | 1.61 ms | -62.1% |
| Small, 10 hops | Request-path throughput | 5,922 records/s | 66,716 records/s | 11.3x |
| Small, 10 hops | Durable throughput | 5,921 records/s | 17,640 records/s | 3.0x |
| Small, 10 hops | Event-loop p99 | 7.78 ms | 1.30 ms | -83.3% |
| 2 MB, 10 hops | Request-path throughput | 126 records/s | 553 records/s | 4.4x |
| 2 MB, 10 hops | Durable throughput | 126 records/s | 336 records/s | 2.7x |
| 2 MB, 10 hops | Event-loop max | 204.08 ms | 2.04 ms | -99.0% |
| 2 MB, 10 hops | RSS delta | 130.20 MB | 66.58 MB | -48.9% |

The optimized 2 MB result above was measured with the then-current 512 KB default, so it is intentionally marked degraded. Production now retains up to the 50 MB hard safety ceiling for each request/response body by default while preserving original size and truncation metadata.

Raw measurements:

- `request-log-baseline.json`
- `request-log-optimized.json`

## HTTP service benchmark

The HTTP benchmark sends 10,000 POST requests with concurrency 64 and a 1 KB body from a separate load-generator process.

| Mode | QPS | Durable QPS | p50 | p95 | p99 | Event-loop p99 | Errors | Rejected logs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No logging control | 32,878 | 32,877 | 1.93 ms | 2.34 ms | 3.02 ms | 1.96 ms | 0 | 0 |
| Synchronous main-thread SQLite | 9,609 | 9,603 | 5.67 ms | 11.44 ms | 13.51 ms | 10.53 ms | 0 | 0 |
| Asynchronous worker logger | 31,879 | 25,757 | 2.02 ms | 3.01 ms | 6.20 ms | 2.06 ms | 0 | 0 |

Compared with synchronous main-thread logging, the asynchronous worker delivers 3.3x request QPS, 2.7x durable QPS, 54.1% lower HTTP p99 latency, and 80.5% lower event-loop p99 delay. Its request-path QPS is 3.0% below the no-logging control, and all 10,000 log events were accepted.

The first unrestricted-network run also exposed a linear scan through the downloaded model-pricing catalog, which limited durable logging to roughly 109 records/s. Building a source-and-model price index once per catalog load removed that bottleneck before the final measurements above.

## Base64 image benchmark

The image scenario reuses an already-received 8 MB JSON request body containing an inline Base64 image, matching the point where request logging starts. Ten records were accepted and compacted. Request-path throughput was 922 records/s, durable throughput was 609 records/s, and no RSS growth was observed in the measured run. The stored JSON retains its structure, MIME information, original wire size, and an image-size descriptor without retaining the encoded pixels. MIME and encoding context are scoped to the same JSON object, so adjacent audio payloads are not compacted.

Raw measurement: `request-log-base64-image.json`.
