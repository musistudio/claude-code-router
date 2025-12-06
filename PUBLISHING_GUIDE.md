# Publishing to npm - Complete Guide

**Package**: `@dev_fasih/claude-code-router`
**Current Version**: `1.0.72`
**npm Username**: `dev_fasih`

---

## 📋 Pre-Publishing Checklist

Before publishing, ensure:

- [X] Package name is available (or you own it): `@dev_fasih/claude-code-router`
- [X] Version number updated in `package.json`
- [ ] All tests passing: `npm test`
- [ ] Build successful: `npm run build`
- [ ] Git committed and pushed to GitHub
- [ ] README.md is up to date
- [ ] CHANGELOG.md updated (if you have one)
- [ ] You're logged into npm: `npm whoami`

---

## 🚀 Publishing Steps

### **Step 1: Login to npm**

```bash
# You're already logged in as dev_fasih
npm whoami
# Should output: dev_fasih

# If not logged in, run:
npm login

# Enter your credentials:
# - Username: dev_fasih
# - Password: (your npm password)
# - Email: (your email)
```

---

### **Step 2: Update Version Number**

Your current version is `1.0.72`. For the wizard feature, you should bump the version:

**Option A: Minor Version (Recommended for new feature)**
```bash
# Bumps to 1.1.0 (new feature added)
npm version minor
```

**Option B: Patch Version (Bug fixes only)**
```bash
# Bumps to 1.0.73 (bug fixes)
npm version patch
```

**Option C: Major Version (Breaking changes)**
```bash
# Bumps to 2.0.0 (breaking changes)
npm version major
```

**Recommended**: Use `npm version minor` since you added a new feature (wizard).

---

### **Step 3: Build the Package**

```bash
# Build production files
npm run build
```

**What this does**:
- Compiles TypeScript → JavaScript
- Bundles CLI tool into `dist/cli.js`
- Prepares UI assets
- Total build time: ~10-20 seconds

**Verify build output**:
```bash
# Check dist folder exists
ls dist/

# Should contain:
# - cli.js (your main CLI file)
# - index.html (UI)
# - tiktoken_bg.wasm (tokenizer)
```

---

### **Step 4: Test the Package Locally**

**Before publishing**, test that it works:

**Windows CMD:**
```cmd
REM Create a test installation in a temp directory
cd %TEMP%
mkdir test-install
cd test-install

REM Link your local package
npm link D:\claude-code-router

REM Test the CLI command
ccr --help
ccr status

REM If it works, you're ready to publish!

REM Clean up
cd ..
rmdir /s /q test-install
```

---

### **Step 5: Review What Will Be Published**

**Windows CMD:**
```cmd
REM See what files will be included in the package
npm pack --dry-run

REM OR create a tarball to inspect
npm pack

REM This creates: dev_fasih-claude-code-router-1.1.0.tgz
REM You can extract it with 7-Zip or WinRAR to inspect
```

**Should include**:
- ✅ `dist/` folder (compiled code)
- ✅ `package.json`
- ✅ `README.md`
- ✅ `LICENSE`
- ❌ `src/` folder (excluded by publishConfig)
- ❌ `node_modules/`
- ❌ `tests/`

---

### **Step 6: Publish to npm**

**Option A: Using the built-in script (Recommended)**
```bash
# This runs build + publish
npm run release
```

**Option B: Manual publish**
```bash
# Build first
npm run build

# Then publish
npm publish
```

**What happens**:
1. npm packages your files
2. Uploads to npm registry
3. Package is now live at: https://npmjs.com/package/@dev_fasih/claude-code-router

**Expected output**:
```
npm notice
npm notice 📦  @dev_fasih/claude-code-router@1.1.0
npm notice === Tarball Contents ===
npm notice 1.2kB  package.json
npm notice 3.4MB  dist/cli.js
npm notice 639kB  dist/index.html
npm notice === Tarball Details ===
npm notice name:          @dev_fasih/claude-code-router
npm notice version:       1.1.0
npm notice package size:  1.2 MB
npm notice unpacked size: 3.9 MB
npm notice total files:   12
npm notice
+ @dev_fasih/claude-code-router@1.1.0
```

---

## 📥 User Installation

After publishing, users can install your package:

### **Global Installation (Recommended)**

```bash
# Install globally (makes 'ccr' command available everywhere)
npm install -g @dev_fasih/claude-code-router

# Verify installation
ccr --version
ccr status
```

### **Local Installation (Project-specific)**

```bash
# Install in a specific project
npm install @dev_fasih/claude-code-router

# Use via npx
npx ccr start
```

---

## 🔄 Updating Your Package

### **When to Publish Updates**

- ✅ New features added (minor version bump)
- ✅ Bug fixes (patch version bump)
- ✅ Breaking changes (major version bump)
- ✅ Security updates (patch/minor)

### **Publishing an Update**

```bash
# 1. Make your changes
# 2. Commit to git
git add .
git commit -m "feat: add new feature"
git push

# 3. Bump version
npm version patch  # or minor, or major

# 4. Build and publish
npm run release

# 5. Push the version tag to GitHub
git push --tags
```

---

## 🏷️ Version Numbering Guide

**Format**: `MAJOR.MINOR.PATCH` (e.g., `1.1.0`)

| Version Type | When to Use | Example |
|--------------|-------------|---------|
| **PATCH** (1.0.72 → 1.0.73) | Bug fixes, small improvements | Fix API key masking bug |
| **MINOR** (1.0.72 → 1.1.0) | New features (backward compatible) | **Add wizard feature** ← Your case |
| **MAJOR** (1.0.72 → 2.0.0) | Breaking changes | Change CLI command names |

**For the wizard feature**: Use `npm version minor` → `1.1.0`

---

## 🔐 Publishing a Scoped Package

Your package is scoped: `@dev_fasih/claude-code-router`

**First-time publish** (if never published before):
```bash
# Make sure package.json has:
{
  "name": "@dev_fasih/claude-code-router",
  "private": false  // or remove this line
}

# Publish as public (scoped packages are private by default)
npm publish --access public
```

**Subsequent publishes**:
```bash
# Just use npm publish (access level remembered)
npm publish
```

---

## 📊 Verifying Publication

### **Check npm Registry**

```bash
# View your published package
npm view @dev_fasih/claude-code-router

# Should show:
# - name: @dev_fasih/claude-code-router
# - version: 1.1.0
# - description: ...
# - dist-tags: { latest: '1.1.0' }
```

### **Check on npmjs.com**

Visit: https://www.npmjs.com/package/@dev_fasih/claude-code-router

You should see:
- Package details
- README displayed
- Install command
- Download statistics

### **Test User Installation**

On a different machine (or new directory):
```bash
# Install your package
npm install -g @dev_fasih/claude-code-router

# Test it works
ccr --version
# Should show: 1.1.0

ccr --help
# Should show all commands including wizard
```

---

## 🔧 Troubleshooting

### **Error: "You do not have permission to publish"**

**Solution**:
```bash
# 1. Verify you're logged in
npm whoami

# 2. If not logged in
npm login

# 3. For scoped packages, publish as public
npm publish --access public
```

---

### **Error: "Version 1.0.72 already exists"**

**Solution**:
```bash
# Bump the version first
npm version patch  # or minor

# Then publish
npm publish
```

---

### **Error: "ENOENT: no such file or directory, open 'dist/cli.js'"**

**Solution**:
```bash
# Build the project first
npm run build

# Then publish
npm publish
```

---

### **Error: "Package name too similar to existing package"**

**Solution**:
- Choose a different package name
- Or add more specific scope like `@dev_fasih/ccr-router`

---

### **Users can't find your package**

**Possible causes**:
1. **Package is private**: Republish with `--access public`
2. **Version not updated**: Check `npm view @dev_fasih/claude-code-router`
3. **npm cache**: Users need to clear cache: `npm cache clean --force`

---

## 📝 Best Practices

### **Before Every Publish**

```bash
# 1. Run tests
npm test

# 2. Build
npm run build

# 3. Check what will be published
npm pack --dry-run

# 4. Update version
npm version patch  # or minor, or major

# 5. Publish
npm publish

# 6. Push tags to GitHub
git push --tags
```

### **Keep GitHub and npm in Sync**

```bash
# After npm publish, create a GitHub release:
# 1. Go to GitHub → Releases → Create Release
# 2. Tag: v1.1.0 (same as npm version)
# 3. Title: "Release 1.1.0 - External Model Wizard"
# 4. Description: Copy from IMPLEMENTATION_SUMMARY.md
```

### **Maintain a CHANGELOG**

Create `CHANGELOG.md`:
```markdown
# Changelog

## [1.1.0] - 2025-12-06

### Added
- Interactive `/external-model` configuration wizard
- Support for Gemini and Qwen providers
- Automatic config validation and backup
- Comprehensive test suite (37 tests)

### Fixed
- Config file corruption prevention with atomic writes

## [1.0.72] - 2025-12-05

### Previous release
...
```

---

## 🌐 Making Your Package Discoverable

### **Add Keywords to package.json**

Already done ✅:
```json
{
  "keywords": [
    "claude",
    "code",
    "router",
    "llm",
    "anthropic",
    "gemini",
    "qwen",
    "wizard",
    "configuration"
  ]
}
```

### **Create a Great README**

Your README should include:
- ✅ Clear description
- ✅ Installation instructions
- ✅ Quick start guide
- ✅ Configuration examples
- ✅ API documentation
- ✅ Troubleshooting
- ✅ Contributing guidelines

### **Add Badges**

Add to your README.md:
```markdown
# Claude Code Router

[![npm version](https://badge.fury.io/js/@dev_fasih%2Fclaude-code-router.svg)](https://www.npmjs.com/package/@dev_fasih/claude-code-router)
[![downloads](https://img.shields.io/npm/dm/@dev_fasih/claude-code-router.svg)](https://www.npmjs.com/package/@dev_fasih/claude-code-router)
[![license](https://img.shields.io/npm/l/@dev_fasih/claude-code-router.svg)](https://github.com/dev_fasih/claude-code-router/blob/main/LICENSE)
```

---

## 📈 Monitoring Your Package

### **Check Download Stats**

Visit: https://npm-stat.com/charts.html?package=@dev_fasih/claude-code-router

Or use npm CLI:
```bash
npm view @dev_fasih/claude-code-router

# Shows:
# - Current version
# - Downloads per week
# - Dependencies
# - Maintainers
```

### **Get Email Notifications**

```bash
# Watch your package for updates
npm star @dev_fasih/claude-code-router

# Get notified of new versions
npm install -g npm-watch
npm-watch @dev_fasih/claude-code-router
```

---

## 🎯 Quick Reference

### **First Time Publishing**

```bash
# 1. Login
npm login

# 2. Bump version
npm version minor  # 1.0.72 → 1.1.0

# 3. Build and publish
npm run release

# 4. Verify
npm view @dev_fasih/claude-code-router
```

### **Updating Existing Package**

```bash
# 1. Make changes, commit, push
git add .
git commit -m "feat: add new feature"
git push

# 2. Bump version
npm version patch  # or minor, or major

# 3. Publish
npm run release

# 4. Push tags
git push --tags
```

### **User Installation Command**

```bash
npm install -g @dev_fasih/claude-code-router
```

---

## ✅ Final Checklist

Before publishing version 1.1.0 with the wizard feature:

- [ ] Run `npm test` - all tests passing
- [ ] Run `npm run build` - successful build
- [ ] Update README.md with wizard documentation
- [ ] Create/Update CHANGELOG.md
- [ ] Commit all changes to git
- [ ] Push to GitHub: `git push origin 001-external-model-wizard`
- [ ] Login to npm: `npm login`
- [ ] Bump version: `npm version minor` (→ 1.1.0)
- [ ] Publish: `npm run release`
- [ ] Push version tag: `git push --tags`
- [ ] Create GitHub release (v1.1.0)
- [ ] Test user installation: `npm install -g @dev_fasih/claude-code-router`
- [ ] Verify on npmjs.com
- [ ] Announce on social media / project channels

---

**Next Steps**:
1. Commit your current changes (wizard feature)
2. Push to GitHub
3. Run `npm version minor` to bump to 1.1.0
4. Run `npm run release` to publish
5. Users can now install with: `npm install -g @dev_fasih/claude-code-router`

**Your package will be live at**: https://www.npmjs.com/package/@dev_fasih/claude-code-router
