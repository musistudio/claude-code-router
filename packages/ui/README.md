# Claude Code Router UI

The web interface for managing Claude Code Router configuration.

## Features

- **Provider Management**: Add, edit, and remove LLM providers (OpenAI, Gemini, Mistral, etc.)
- **Model Discovery**: Easily discover and sync remote models from providers
- **Router Configuration**: Define routing rules based on model tags and performance
- **Transformer Pipeline**: Configure message transformers for different models
- **Real-time Logs**: View server logs directly in the browser
- **JSON Editor**: Advanced JSON editor for direct configuration tweaks

## Model Discovery Configuration

When adding or editing a provider, you can configure model discovery settings. For non-standard providers, use the following advanced options in the configuration:

- **models_api_url**: The endpoint URL for listing models.
- **models_response_format**: Custom parsing logic for the JSON response:
  - `listPath`: Path to the models array (e.g., `data`, `models`, or `""` for root).
  - `idPath`: Field name for the model ID (e.g., `id`, `name`, `slug`).
  - `stripPrefix`: Prefix to remove from discovered IDs (e.g., `models/`).

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Environment Variables

- `VITE_API_BASE_URL`: Base URL for the CCR API (defaults to `/api` if served by the router).
- `VITE_API_KEY`: Optional static API key for development.
