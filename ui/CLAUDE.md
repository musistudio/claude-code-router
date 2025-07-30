# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a frontend project for a configuration settings UI. The goal is to produce a single, self-contained HTML file with all JavaScript and CSS inlined. The application should be designed with a clean, modern UI and support both English and Chinese languages.

## Tech Stack

- **Package Manager:** pnpm
- **Build Tool:** Vite.js
- **Framework:** React.js
- **Styling:** Tailwind CSS with shadcn-ui
- **Languages:** TypeScript, English, Chinese

## Key Commands

- **Run development server:** `pnpm dev`
- **Build for production:** `pnpm build` (This produces a single HTML file)
- **Lint files:** `pnpm lint`
- **Preview production build:** `pnpm preview`

## Architecture & Development Notes

- **Configuration:** The application's configuration structure is defined in `config.example.json`. This file should be used as a reference for mocking data, as no backend APIs will be implemented.
- **Build Target:** The final build output must be a single HTML file. This is configured in `vite.config.ts` using `vite-plugin-singlefile`.
- **Internationalization (i18n):** The project uses `i18next` to support both English and Chinese. Locale files are located in `src/locales/`. When adding or changing text, ensure it is properly added to the translation files.
- **UI:** The UI is built with `shadcn-ui` components. Refer to existing components in `src/components/ui/` for styling conventions.
- **API Client:** The project uses a custom `ApiClient` class for handling HTTP requests with baseUrl and API key authentication. The class is defined in `src/lib/api.ts` and provides methods for GET, POST, PUT, and DELETE requests.

## 项目描述
参考`PROJECT.md`文件