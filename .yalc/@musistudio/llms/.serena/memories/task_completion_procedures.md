# Task Completion Procedures

## Before Committing Code
1. **Linting**: Run `npm run lint` to check TypeScript compliance
2. **Build**: Run `npm run build` to ensure compilation succeeds
3. **Testing**: Manual testing via development server (`npm run dev`)
4. **Local Package Testing**: Use yalc workflow for integration testing

## Local Development with yalc (Preferred)
```bash
# In llms-dev project
yalc publish           # Publish changes to yalc registry
yalc push             # Push updates to linked projects

# In consuming project (ccr-dev)
yalc add @musistudio/llms    # Link the package
npm run build                # Rebuild consumer
```

## Deployment Commands
- **Development**: `npm run dev` (nodemon + tsx hot-reloading)
- **Production Build**: `npm run build` (creates dist/cjs and dist/esm)
- **Start Production**: `npm start` (CJS) or `npm run start:esm` (ESM)

## Documentation Standards
- Update CLAUDE.md for major architectural changes
- Follow conventional commit messages (feat:, fix:, docs:, etc.)
- Document transformer additions in the main export index