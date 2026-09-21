# Contributing to @ztechnium/rai-sdk

Thank you for helping improve the RAI TypeScript SDK.

## Development Setup

```bash
npm install
npm test
```

## Making Changes

1. Fork [ztechnium/rai-typescript-sdk](https://github.com/ztechnium/rai-typescript-sdk) and create a feature branch.
2. Keep changes focused on the public `/sdk/v1` client contract.
3. Add or update tests in `tests/` for behavior changes.
4. Run `npm test` before opening a pull request.
5. Update `CHANGELOG.md` for user-visible changes.

## Pull Request Checklist

- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm pack --dry-run` includes only intended files
- [ ] Public exports remain stable or breaking changes are documented

## Release Process

Releases are automated from tags matching `v*` via `.github/workflows/publish.yml`.

Do not publish manually unless responding to an incident.
