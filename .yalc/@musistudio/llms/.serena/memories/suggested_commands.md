# Suggested Commands

## Development Commands
- **Install dependencies**: `pnpm install` or `npm install`
- **Development mode**: `npm run dev` (Uses nodemon + tsx for hot-reloading)
- **Build**: `npm run build` (Outputs to dist/cjs and dist/esm)
- **Build with watch**: `npm run build:watch` (Continuous build during development)
- **Lint**: `npm run lint` (Runs ESLint on src directory)
- **Start server (CJS)**: `npm start` or `node dist/cjs/server.cjs`
- **Start server (ESM)**: `npm run start:esm` or `node dist/esm/server.mjs`

## Local Development with yalc (Recommended)
```bash
# Publish to yalc registry
yalc publish

# In consuming project (ccr-dev)
yalc add @musistudio/llms
npm run build

# Push updates after changes
yalc push  # Automatically updates all linked projects
```

## macOS System Commands
- **File operations**: `ls`, `find`, `grep` (standard Unix commands)
- **Process management**: `ps aux | grep <process>`, `kill <PID>`
- **Directory navigation**: `cd`, `pwd`
- **Package management**: `npm cache clean --force` (if needed)