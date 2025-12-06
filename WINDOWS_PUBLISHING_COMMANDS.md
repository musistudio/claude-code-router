# Windows CMD Publishing Commands

**Quick reference for publishing on Windows Command Prompt**

**Package**: `@dev_fasih/claude-code-router`
**Version**: `1.1.0` ✅ (already bumped!)
**npm User**: `dev_fasih` ✅

---

## 🚀 Publishing Right Now (4 Steps)

```cmd
REM Step 1: Verify you're logged in
npm whoami
REM Should show: dev_fasih

REM Step 2: Run tests (optional)
npm test

REM Step 3: Build the package
npm run build

REM Step 4: Publish (FIRST TIME - use --access public)
npm publish --access public

REM Step 5: Push version tag to GitHub
git push --tags
```

**Done! 🎉 Your package is now live!**

---

## 📦 What Users Will Run

```cmd
REM Install your package globally
npm install -g @dev_fasih/claude-code-router

REM Verify installation
ccr --version
REM Should show: 1.1.0

REM Use the wizard
ccr start
REM Then in chat: /external-model
```

---

## 🔄 If Not Logged In

```cmd
REM Login to npm
npm login
REM Enter: Username: dev_fasih
REM Enter: Password: (your password)
REM Enter: Email: (your email)

REM Verify
npm whoami
```

---

## 📝 Before Publishing Checklist

```cmd
REM 1. Check current directory
cd D:\claude-code-router

REM 2. Verify package.json
type package.json | findstr "name version"
REM Should show:
REM   "name": "@dev_fasih/claude-code-router",
REM   "version": "1.1.0",

REM 3. Check if version already published
npm view @dev_fasih/claude-code-router
REM If 404 error = not published yet (good!)
REM If shows package = already exists

REM 4. Run tests
npm test

REM 5. Build
npm run build

REM 6. Review what will be published
npm pack --dry-run
```

---

## ✅ After Publishing

```cmd
REM 1. Verify it's published
npm view @dev_fasih/claude-code-router

REM 2. Test installation in new directory
cd %TEMP%
mkdir test-ccr
cd test-ccr
npm install -g @dev_fasih/claude-code-router
ccr --version
ccr --help

REM 3. Clean up test
cd ..
rmdir /s /q test-ccr
```

---

## 🔧 Troubleshooting

### Error: "You do not have permission to publish"

```cmd
REM Solution: Add --access public for scoped packages
npm publish --access public
```

### Error: "Version 1.1.0 already exists"

```cmd
REM Solution: Bump version again
npm version patch
REM This will create 1.1.1
npm publish --access public
```

### Error: "ENOENT: no such file or directory, open 'dist/cli.js'"

```cmd
REM Solution: Build first
npm run build
npm publish --access public
```

### Error: "npm ERR! need auth"

```cmd
REM Solution: Login first
npm login
npm publish --access public
```

---

## 📊 Verifying Publication

```cmd
REM Check on npm registry
npm view @dev_fasih/claude-code-router

REM Visit in browser
start https://www.npmjs.com/package/@dev_fasih/claude-code-router

REM Check download stats
npm info @dev_fasih/claude-code-router
```

---

## 🔄 Publishing Future Updates

```cmd
REM 1. Make your changes and commit
git add .
git commit -m "fix: your bug fix description"
git push

REM 2. Bump version (choose one)
npm version patch
REM   1.1.0 -> 1.1.1 (bug fixes)

npm version minor
REM   1.1.0 -> 1.2.0 (new features)

npm version major
REM   1.1.0 -> 2.0.0 (breaking changes)

REM 3. Build and publish
npm run build
npm publish

REM 4. Push tags
git push --tags
```

---

## 📍 Important File Locations (Windows)

```cmd
REM Config directory
echo %USERPROFILE%\.claude-code-router

REM Config file
type %USERPROFILE%\.claude-code-router\config.json

REM Backup files
dir %USERPROFILE%\.claude-code-router\config.json.backup-*

REM Log files
dir %USERPROFILE%\.claude-code-router\logs
```

---

## 🎯 Complete Publishing Flow (Copy-Paste Ready)

```cmd
REM ============================================
REM Complete Windows CMD Publishing Flow
REM ============================================

REM Navigate to project
cd D:\claude-code-router

REM Verify logged in
npm whoami

REM Run tests
npm test

REM Build
npm run build

REM Review what's being published
npm pack --dry-run

REM Publish (FIRST TIME ONLY - use --access public)
npm publish --access public

REM Push git tags
git push --tags

REM Verify published
npm view @dev_fasih/claude-code-router

REM Test installation
npm install -g @dev_fasih/claude-code-router

REM Check version
ccr --version

REM ============================================
REM Done! Package is live! 🎉
REM ============================================
```

---

## 📱 Quick Commands Reference

| Task | Command |
|------|---------|
| **Check login** | `npm whoami` |
| **Login** | `npm login` |
| **Run tests** | `npm test` |
| **Build** | `npm run build` |
| **Publish (first time)** | `npm publish --access public` |
| **Publish (updates)** | `npm publish` |
| **Bump patch** | `npm version patch` |
| **Bump minor** | `npm version minor` |
| **Bump major** | `npm version major` |
| **Push tags** | `git push --tags` |
| **View package** | `npm view @dev_fasih/claude-code-router` |
| **Install globally** | `npm install -g @dev_fasih/claude-code-router` |

---

## ⚡ Super Quick Publish (You're Already at v1.1.0!)

Since you already bumped to `1.1.0`, just run these 3 commands:

```cmd
npm run build
npm publish --access public
git push --tags
```

**That's it! 🚀**

---

## 🌐 After Publishing, Share These Commands

Tell users to install with:

```cmd
npm install -g @dev_fasih/claude-code-router
```

Then use:

```cmd
ccr start
```

In chat, type: `/external-model`

---

**Package URL**: https://www.npmjs.com/package/@dev_fasih/claude-code-router
**Your npm Profile**: https://www.npmjs.com/~dev_fasih
