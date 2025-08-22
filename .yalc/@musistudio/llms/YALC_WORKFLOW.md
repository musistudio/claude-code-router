# YALC Development Workflow

## Setup Complete ✅

The yalc workflow has been properly configured and tested. This replaces the problematic npm cache approach with a reliable local development system.

## Current Status

- ✅ `llms-dev` is publishing to yalc store
- ✅ `ccr-dev` is linked and receiving updates via yalc
- ✅ Workflow scripts created and tested
- ✅ Changes propagate correctly from llms-dev to ccr-dev

## Quick Commands

### In llms-dev (this directory)
```bash
# Rapid development iteration (build + publish + push)
./dev-workflow.sh

# Manual steps if needed
npm run build
yalc publish
yalc push
```

### In ccr-dev
```bash
# Build CCR after receiving llms updates
./build-and-test.sh

# Manual steps if needed
npm run build
yalc check  # verify yalc status
```

## Development Workflow

### 1. Make changes in llms-dev
```bash
# Edit your code in src/
vim src/transformer/openai.transformer.ts

# Run the automated workflow
./dev-workflow.sh
```

### 2. Build and test in ccr-dev
```bash
cd /Users/fredrikbranstrom/ccr-dev
./build-and-test.sh
ccr code  # or your preferred test method
```

### 3. Verify changes
```bash
# Check that your changes made it through
grep -r "your-test-pattern" node_modules/@musistudio/llms/
```

## Advantages Over npm pack/install

- **No cache corruption**: Direct symlinks avoid npm cache issues
- **Instant updates**: `yalc push` immediately updates all linked projects  
- **No abandoned processes**: No risk of stuck npm dev servers
- **Clean workflow**: No need for cache clearing or process killing
- **Persistent links**: Links survive across npm installs

## Scripts Created

### `/Users/fredrikbranstrom/llms-dev/dev-workflow.sh`
Automated build → publish → push workflow for rapid iteration.

### `/Users/fredrikbranstrom/ccr-dev/build-and-test.sh`  
Build CCR and verify yalc linkage.

## Verification Test ✅

Added test comment to `OpenAITransformer` constructor:
```typescript
constructor() {
  // YALC TEST: This comment was added to test the yalc workflow  
}
```

This comment successfully propagated through the entire workflow:
1. Built in llms-dev ✅
2. Published to yalc ✅  
3. Pushed to ccr-dev ✅
4. Included in ccr-dev build ✅

## Troubleshooting

### If yalc links break:
```bash
cd /Users/fredrikbranstrom/ccr-dev
yalc remove @musistudio/llms
yalc add @musistudio/llms
npm run build
```

### If changes don't propagate:
```bash
cd /Users/fredrikbranstrom/llms-dev
./dev-workflow.sh
cd /Users/fredrikbranstrom/ccr-dev  
./build-and-test.sh
```

### Check yalc status:
```bash
yalc check  # Shows linked packages
cat yalc.lock  # Shows yalc configuration
```

## Critical Success Factors

1. **Always build first**: `npm run build` before `yalc publish`
2. **Use yalc push**: This updates all linked projects automatically
3. **Rebuild consumers**: Always `npm run build` in ccr-dev after updates
4. **Test propagation**: Verify your changes actually made it through

## Ready for Tonight's Debugging Session

The yalc workflow is now properly configured and tested. Changes made in llms-dev will immediately propagate to ccr-dev, eliminating npm cache nightmares that could prevent debugging code from working.

**Next steps for debugging:**
1. Make your debugging changes in llms-dev
2. Run `./dev-workflow.sh`  
3. Run `cd /Users/fredrikbranstrom/ccr-dev && ./build-and-test.sh`
4. Test with `ccr code` or your debugging setup

No more npm cache issues blocking your debugging workflow! 🎉