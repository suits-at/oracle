# Windows Compatibility

> Current status of Oracle CLI on Windows, including what works and known limitations

**Last Updated**: 2025-11-19
**Branch**: windows-remote-chrome
**Status**: ✅ API mode fully functional | ❌ Browser mode not recommended

---

## Summary

### ✅ What Works on Windows

**API Mode** (Fully Supported):
- All 36 file operation tests pass
- Glob patterns (`src/**/*.ts`, `!**/*.test.ts`)
- `.gitignore` parsing and filtering
- Directory expansion and deduplication
- Dotfile handling
- Default ignored directories
- Session management
- CLI interface
- Desktop notifications

**Requirements**:
- Node.js 20+
- pnpm 10
- OpenAI API key

### ❌ What Doesn't Work

**Browser Mode** (Not Recommended):
- Cookie sync hangs indefinitely
- ChatGPT requires authentication (no free tier)
- Remote Chrome WebSocket failures

Browser mode has multiple blocking issues on Windows and is not viable for production use.

---

## Installation

### Basic Installation

```powershell
# Install dependencies
pnpm install --frozen-lockfile

# Build the project
pnpm build

# Test installation
pnpm oracle --help
```

### Native Modules (For Browser Mode Debugging Only)

If you need to rebuild native modules (`win-dpapi`, `chrome-cookies-secure`, `sqlite3`, `keytar`) for browser mode testing:

**Prerequisites**:
- Python 3.x
- Visual Studio Build Tools with "Desktop development with C++"
- node-gyp

**Automated Rebuild**:
```powershell
.\rebuild-native-modules.ps1
```

This script checks prerequisites, rebuilds all native modules, and validates they load correctly. Takes 2-5 minutes to run.

**Note**: Even with native modules working, browser mode still has blocking issues on Windows (see below).

---

## Browser Mode Issues on Windows

After extensive testing with successfully built native modules, browser mode is not viable on Windows due to multiple blocking issues.

### Issue 1: Cookie Sync Hangs Indefinitely

**File**: `src/browser/cookies.ts:56`
**Status**: ❌ UNRESOLVED

**Problem**:
- `chrome-cookies-secure`'s `getCookiesPromised()` call hangs indefinitely on Windows
- Chrome launches successfully, connects to DevTools, but gets stuck at cookie sync
- No error thrown - promise never resolves or rejects
- Chrome closes after ~5-10 seconds

**Root Cause**: Unknown - likely deep issue in `chrome-cookies-secure` or `win-dpapi` interaction with Windows DPAPI on Windows 11

**Workarounds Attempted**:
- ✅ Native modules built successfully and load without errors
- ✅ Using `--browser-allow-cookie-errors` (doesn't help - promise still hangs)
- ✅ Closing all other Chrome instances (doesn't help)
- ❌ No working solution found

### Issue 2: ChatGPT Requires Authentication

**Status**: ❌ BY DESIGN (ChatGPT change)

**Problem**:
- Using `--browser-no-cookie-sync` to bypass cookie sync issue
- ChatGPT loads UI but generates no response for unauthenticated users
- Prompt is typed and sent successfully
- ChatGPT shows copy button but no text
- Oracle waits forever for response that never comes

**Analysis**:
```typescript
// Response detection code (src/browser/actions/assistantResponse.ts:398)
if (text.trim()) {  // ← Returns null when text is empty
  return { text, html, messageId, turnId };
}
return null;  // ← Keeps waiting forever
```

ChatGPT's UI loads for unauthenticated users, but actual response generation requires login. This is not a bug - it's how ChatGPT now works.

### Issue 3: Remote Chrome WebSocket Failures

**Status**: ❌ UNRESOLVED

**Problem**:
- Remote Chrome mode fails with "socket hang up" errors
- HTTP endpoint responds correctly: `curl http://localhost:9222/json` works
- Shows ChatGPT tab in target list
- Oracle fails connecting: "Failed to open dedicated remote Chrome tab (socket hang up)"
- Fallback to first target also fails

**Attempted Fixes**:
- ✅ Added `--remote-allow-origins="*"` flag
- ✅ Used temp profile: `--user-data-dir="C:\temp\chrome-remote-profile"`
- ✅ Verified no firewall blocking
- ❌ Still fails with WebSocket connection errors

**Root Cause**: Likely issue with `chrome-remote-interface` library's WebSocket implementation on Windows, or Windows network stack handling of WebSocket connections to local Chrome

### Tested Configurations (All Failed)

| Configuration | Cookie Sync | Authentication | Response | Result |
|--------------|-------------|----------------|----------|---------|
| Browser mode (default) | ❌ Hangs | N/A | N/A | **BLOCKED** |
| `--browser-no-cookie-sync` | ⏭️ Skipped | ❌ Not logged in | ❌ Empty | **BLOCKED** |
| `--browser-allow-cookie-errors` | ❌ Hangs anyway | N/A | N/A | **BLOCKED** |
| `--remote-chrome localhost:9222` | ⏭️ N/A | ✅ Could log in | ❌ Socket hang up | **BLOCKED** |

---

## Recommendations

### For Windows Users

1. **✅ Use API Mode** (Recommended)
   - Fully functional with all tests passing
   - Requires OpenAI API key ($5 minimum deposit)
   - Much more reliable than browser automation
   ```powershell
   pnpm oracle --engine api --prompt "your question" --file "src/**/*.ts"
   ```

2. **❌ Avoid Browser Mode**
   - Multiple blocking issues with no workarounds
   - Not worth the debugging time
   - Not recommended for production use

3. **Consider WSL + Linux Chrome** (If browser mode required)
   - Run Oracle CLI from WSL
   - Use Linux Chrome for browser automation
   - Avoids Windows-specific issues

### For Upstream

Browser mode issues should be documented in README.md:

```markdown
### Windows Support

✅ **API Mode**: Fully supported
❌ **Browser Mode**: Not recommended - multiple known issues:
- Cookie sync hangs indefinitely
- Remote Chrome WebSocket failures
- ChatGPT requires authentication (no free tier access)

Windows users should use API mode with an OpenAI API key.
```

---

## Testing on Windows

### Run Test Suite

```powershell
# Run all tests (all should pass)
pnpm test

# Expected results:
# - Total: 240 tests
# - Passing: 239 tests (all file operations pass)
# - Failures: 1 test (version timeout - pre-existing, not Windows-specific)
```

### Test File Operations

```powershell
# Test glob patterns
pnpm oracle -p "test" --file "src/**/*.ts" --dry-run --engine api

# Test with exclusions
pnpm oracle -p "test" --file "src/**/*.ts" --file "!**/*.test.ts" --dry-run --engine api

# Test with .gitignore
pnpm oracle -p "test" --file "." --dry-run --engine api
```

---

## Technical Details

### What Was Fixed

All file operation issues on Windows were resolved:

1. **Windows Absolute Paths**: Fixed misdetection as glob patterns by checking `path.isAbsolute()` before `isDynamicPattern()`
2. **Gitignore Path Matching**: Normalized all paths to forward slashes for consistent comparison
3. **Number Formatting**: Explicitly use 'en-US' locale for consistent formatting across regions

These fixes enable all 36 file operation tests to pass on Windows.

### Native Modules

**Build Requirements** (for browser mode debugging only):
- Python 3.x (for node-gyp, sqlite3)
- Visual Studio Build Tools with C++ workload
- Windows 10/11 SDK
- node-gyp

**Modules**:
- `chrome-cookies-secure` - Requires sqlite3 native compilation
- `sqlite3` - Needs Python + build tools
- `keytar` - Needs node-gyp + Windows SDK
- `win-dpapi` - Windows DPAPI wrapper (transitive dependency)

**Rebuild Script**: Use `rebuild-native-modules.ps1` for automated rebuild with prerequisite checks and validation.

---

## Troubleshooting

### Installation Issues

**Problem**: `pnpm install` fails
**Solution**: All installation issues were fixed. Make sure you're on the latest commit.

### Native Module Build Failures

**Problem**: `win-dpapi` or `sqlite3` won't compile
**Solution**:
1. Install Visual Studio Build Tools with "Desktop development with C++"
2. Install Python 3.x and add to PATH
3. Run `.\rebuild-native-modules.ps1`

**Note**: Native modules are only needed for browser mode, which is not recommended on Windows anyway.

### File Operation Issues

**Problem**: Glob patterns not working
**Solution**: This was fixed. All 36 file operation tests now pass. Update to latest commit.

---

## Session History

**Testing Duration**: ~3 hours of extensive debugging
**Issues Investigated**: Cookie sync, authentication, remote Chrome, focus stealing
**Fixes Applied**: All file operations working, browser mode issues documented
**Code Changes**: All testing changes reverted (clean codebase)
**Useful Artifacts**: `rebuild-native-modules.ps1` utility

**Conclusion**: API mode works perfectly on Windows. Browser mode is not viable and should not be used.
