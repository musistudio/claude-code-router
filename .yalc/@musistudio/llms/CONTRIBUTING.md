# Contributing to LLMs

Thank you for your interest in contributing! Please follow these guidelines to ensure smooth collaboration.

## Development Environment

- Node.js 18+
- Recommended package manager: npm or pnpm
- Recommended editor: VSCode + TypeScript plugin

## Branch & PR Guidelines

- Create feature/bugfix branches from the latest `main` branch.
- Each feature/fix should be in a separate branch, avoid mixing unrelated changes.
- PR titles should be concise; descriptions must state the purpose, scope, and testing method.
- Ensure local build and tests pass before submitting a PR.

## Code Style

- Strict TypeScript mode.
- 2-space indentation.
- Prefer `@/` alias for imports.
- Keep comments clear and up-to-date.

## Commit Message Convention

- feat: new feature
- fix: bug fix
- docs: documentation
- refactor: refactor
- test: test related
- chore: build/deps/chore

## Testing

- Add/modify unit tests for new/changed features.
- Run `npm test` to ensure all tests pass.

## Review Process

- PRs will be reviewed by maintainers/reviewers.
- Address review comments promptly.
- Only merge after approval.

## FAQ

- Path alias not working? Check `tsconfig.json` and ensure your runtime supports it.
- Dependency install failed? Try switching npm/pnpm registry or upgrading Node.
- For other issues, please open an issue.

---
