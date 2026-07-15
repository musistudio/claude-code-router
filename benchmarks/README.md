# Request log benchmarks

Run the request-log benchmark with the same Electron/Node native runtime selection used by the test runner:

```sh
npm run benchmark:request-logs -- --label local
```

To persist a machine-readable result:

```sh
npm run benchmark:request-logs -- --label local --output benchmarks/results/request-log-local.json
```

The benchmark has two layers:

- A request-log microbenchmark covering small records without a route trace, small records with a 10-hop route trace, 2 MB request bodies with a 10-hop trace, and 8 MB Base64 image requests.
- A real loopback HTTP service benchmark comparing no logging, synchronous main-thread SQLite logging, and the asynchronous worker logger.

The HTTP benchmark uses a separate load-generator process so client work does not share the server event loop. It reports QPS, durable QPS, p50/p95/p99/max latency, HTTP errors, rejected log events, event-loop p99/max delay, CPU, heap, and RSS changes.

The default web load is 10,000 requests with concurrency 64 and a 1 KB request body. It can be adjusted without editing code:

```sh
npm run benchmark:request-logs -- \
  --web-requests 20000 \
  --web-concurrency 128 \
  --web-body-bytes 4096 \
  --label web-load
```

Use `--skip-web` when only the storage microbenchmark is needed, or `--skip-storage` when iterating only on HTTP performance. Both layers report request-path time separately from durable flush time so moving work off the request thread cannot hide storage regressions.
