# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains a TypeScript-based router for Claude Code requests, allowing flexible routing to different LLM providers. It also includes a separate UI project for configuration management.

## Tech Stack

-   **Root Project:** TypeScript, Node.js, esbuild, Fastify, various LLM SDKs via `@musistudio/llms`.
-   **UI Project:** React.js, Vite.js, TypeScript, Tailwind CSS, shadcn-ui, i18next.

## Key Commands

### Root Project (using npm)
-   **Build the router:** `npm run build`
-   **Release a new version:** `npm run release`
-   **Start the router server:** `ccr start`
-   **Stop the router server:** `ccr stop`
-   **Check the server status:** `ccr status`
-   **Run Claude Code through the router:** `ccr code "<your prompt>"`
-   **Open UI Mode:** `ccr ui`
-   **Restart the router server:** `ccr restart`
-   **Type Checking:** `tsc --noEmit` (inferred from tsconfig.json)

### UI Project (using pnpm)
-   **Run development server:** `pnpm dev`
-   **Build UI for production:** `pnpm build` (Creates a single HTML file)
-   **Lint UI files:** `pnpm lint`
-   **Preview UI production build:** `pnpm preview`

## Architecture

-   **Claude Code Router:**
    -   **Entry Point:** `src/cli.ts` handles command-line arguments.
    -   **Server Logic:** Initiated from `src/index.ts`, using Fastify.
    -   **Configuration:** Managed via `~/.claude-code-router/config.json` (see `config.example.json` for structure). Supports environment variable interpolation.
    -   **Routing Logic:** Core logic likely in `src/utils/router.ts`, handling default routes (`default`, `background`, `think`, `longContext`, `webSearch`) and custom router scripts.
    -   **Providers & Transformers:** Configurable in `config.json` to support multiple LLM providers and adapt requests/responses.
    -   **Dependencies:** Key dependency is `@musistudio/llms`.
-   **UI Project:**
    -   **Build Target:** A single, self-contained HTML file using `vite-plugin-singlefile`.
    -   **Internationalization (i18n):** Supports English and Chinese using `i18next`, with locale files in `src/locales/`.
    -   **UI Components:** Built with `shadcn-ui`, with components found in `src/components/ui/`.
    -   **API Client:** Custom `ApiClient` class in `src/lib/api.ts` for handling HTTP requests.

## Key Files

-   **Root Project:**
    -   `package.json`: Project metadata and npm scripts.
    -   `tsconfig.json`: TypeScript compiler options.
    -   `src/cli.ts`: Command-line interface entry point.
    -   `src/index.ts`: Server initialization.
    -   `src/utils/router.ts`: (Likely) Core routing logic.
    -   `config.example.json`: Example configuration file.
-   **UI Project:**
    -   `ui/package.json`: UI project metadata and pnpm scripts.
    -   `ui/vite.config.ts`: Vite configuration, including single-file build.
    -   `ui/src/lib/api.ts`: API client implementation.
    -   `ui/src/locales/`: Language translation files.
    -   `ui/src/components/ui/`: shadcn-ui components.

## Development Notes

-   **Configuration:** Customize router behavior via `~/.claude-code-router/config.json`.
-   **Environment Variables:** Use environment variables for sensitive data like API keys (e.g., `$OPENAI_API_KEY` in `config.json`).
-   **Non-Interactive Mode:** Set `"NON_INTERACTIVE_MODE": true` in `config.json` for CI/CD environments (like GitHub Actions) to prevent process hangs.
-   **Transformers:** Utilize built-in or custom transformers to adapt LLM requests/responses for different providers.
-   **Subagent Routing:** Use `<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>` at the start of subagent prompts for specific model routing.
-   **Status Line:** Enable the statusline tool in the UI for runtime monitoring.

## Further Reading

-   [Project Motivation and How It Works](blog/en/project-motivation-and-how-it-works.md)
-   [Maybe We Can Do More with the Router](blog/en/maybe-we-can-do-more-with-the-route.md)

## Support & Sponsoring

Information on supporting the project can be found in the `README.md`.
