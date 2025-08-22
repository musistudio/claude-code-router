# Code Style & Conventions

## TypeScript Standards
- **Strict TypeScript mode** with 2-space indentation
- **Target**: Node.js 18+ with ES2022 features
- **Import Style**: Prefer `@/` alias for imports (maps to `src` directory)
- **Type Definitions**: Strong typing with interface implementations

## File Organization
- **Transformers**: Located in `src/transformer/` directory
- **Services**: Core business logic in `src/services/`
- **Types**: Shared type definitions in `src/types/`
- **Utils**: Helper functions in `src/utils/`

## Naming Conventions
- **Classes**: PascalCase (e.g., `ReasoningTransformer`, `OpenAITransformer`)
- **Files**: kebab-case (e.g., `reasoning.transformer.ts`)
- **Methods**: camelCase (e.g., `transformRequestOut`, `transformResponseIn`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `TransformerName`)

## Architecture Patterns
- **Transformer Pattern**: Implement `Transformer` interface with optional methods
- **Service Layer**: Clear separation between config, provider, LLM, and transformer services
- **Error Handling**: Comprehensive try-catch with fallback responses
- **Logging**: Debug logs to temporary files for complex transformations