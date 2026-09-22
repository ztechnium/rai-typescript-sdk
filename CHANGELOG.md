# Changelog

All notable changes to `@ztechnium/rai-sdk` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-22

### Fixed

- Avoid reading the same HTTP response body twice when mapping non-2xx SDK errors to `RAIError`.

## [0.1.0] - 2026-03-24

### Added

- Initial public release of the TypeScript SDK for RAI Control Plane `/sdk/v1`.
- `RAIClient` with health, heartbeat, session lifecycle, and execution reporting.
- `Session`, `Decision`, and `RAIError` types.
- Fail-closed default behavior, request timeouts via `AbortController`, and idempotency key support.
- `SDK_VERSION` and `API_RANGE` constants for compatibility checks.

[0.1.0]: https://github.com/ztechnium/rai-typescript-sdk/releases/tag/v0.1.0
