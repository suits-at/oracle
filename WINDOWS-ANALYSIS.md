# Oracle Windows Compatibility Analysis

> Analysis of Windows support status, known issues, and testing roadmap for the Oracle CLI project

## Project Overview

**Oracle** is a CLI wrapper around OpenAI's Responses API (GPT-5 Pro and GPT-5.1) with two execution engines:
- **API engine**: Direct OpenAI API calls (stable, recommended)
- **Browser engine**: Chrome automation using ChatGPT web interface (experimental, macOS-focused)

**Current platform status**: Windows support is **partially working** but has known issues, particularly around file system operations and browser automation.

---

## Project Structure

```
oracle/
├── src/
│   ├── bin/                    # CLI entry points
│   │   ├── oracle-cli.ts       # Main CLI (#!/usr/bin/env node)
│   │   └── oracle-mcp.js       # MCP server entry
│   ├── cli/                    # CLI-specific logic
│   │   ├── notifier.ts         # Desktop notifications
│   │   ├── sessionDisplay.ts   # Session rendering
│   │   ├── sessionRunner.ts    # Session execution
│   │   ├── options.ts          # CLI option parsing
│   │   └── tui/                # Interactive terminal UI
│   ├── oracle/                 # Core Oracle API logic
│   │   ├── files.ts           # ⚠️ File reading/glob expansion (CRITICAL for Windows)
│   │   ├── client.ts          # OpenAI API client
│   │   ├── run.ts             # Session execution
│   │   └── request.ts         # Request building
│   ├── browser/                # Browser automation (experimental)
│   │   ├── cookies.ts         # ⚠️ Chrome cookie extraction (Windows issues)
│   │   ├── chromeLifecycle.ts # ⚠️ Chrome window management (macOS-only features)
│   │   ├── pageActions.ts     # DOM interactions
│   │   └── actions/           # Prompt composer, model selection
│   ├── mcp/                    # MCP server implementation
│   │   ├── server.ts          # stdio MCP server
│   │   └── tools/             # MCP tools (consult, sessions)
│   └── sessionManager.ts       # Session storage (~/.oracle/sessions)
├── tests/                      # Test suite
│   ├── oracle-cli.test.ts     # ⚠️ 9 tests skipped on Windows
│   ├── browser/               # Browser automation tests
│   └── cli/                   # CLI integration tests
├── scripts/                    # Development scripts
│   └── browser-tools.ts       # ⚠️ Chrome inspection (macOS/Linux only)
└── docs/                       # Documentation
    ├── browser-mode.md        # Browser engine docs
    ├── configuration.md       # Config file format
    └── notifier.md            # Notification backends
```

---

## Windows-Specific Issues

### 🔴 CRITICAL ISSUES (Immediate Blockers)

#### 1. **Hardcoded Unix Python Path**
- **File**: `src/browser/cookies.ts:209`
- **Issue**: `childEnv.PYTHON = childEnv.PYTHON ?? '/usr/bin/python3';`
- **Impact**: SQLite3 rebuild will fail on Windows (no `/usr/bin/python3`)
- **Fix needed**: Detect Python on Windows (`python.exe` or `python3.exe` via PATH)
- **Workaround**: Set `PYTHON` environment variable before running

```typescript
// Current (broken on Windows):
childEnv.PYTHON = childEnv.PYTHON ?? '/usr/bin/python3';

// Should be:
childEnv.PYTHON = childEnv.PYTHON ?? (process.platform === 'win32' ? 'python' : '/usr/bin/python3');
```

#### 2. **File Path Normalization**
- **File**: `src/oracle/files.ts`
- **Issue**: Windows uses backslash separators (`\`) vs Unix forward slash (`/`)
- **Status**: ✅ **FIXED** in commit `f4d9f82`
- **Solution**: All paths normalized via `toPosix()` helpers
  - Lines 366-380: POSIX normalization functions
  - Line 290: Gitignore pattern normalization
  - All glob operations use forward slashes internally

**Key functions**:
```typescript
function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function toPosixRelative(absPath: string, cwd: string): string {
  const relative = path.relative(cwd, absPath);
  return toPosix(relative || '.');
}
```

#### 3. **Native Module Compilation**
- **Modules**: `chrome-cookies-secure`, `sqlite3`, `keytar`
- **Status**: Listed in `package.json:onlyBuiltDependencies`
- **Issue**: Requires native build toolchain on Windows
  - **sqlite3**: Needs Python + Visual Studio Build Tools
  - **keytar**: Needs node-gyp with Windows SDK
  - **chrome-cookies-secure**: Depends on sqlite3
- **Current handling**: Auto-rebuild on macOS/Linux (line 202: `pnpm.cmd` on Windows)
- **Risk**: Build failures on Windows without proper toolchain

**Rebuild command** (Windows):
```bash
# Requires: Python, Visual Studio Build Tools, node-gyp
set PYTHON=python
set npm_config_build_from_source=1
pnpm rebuild chrome-cookies-secure sqlite3 keytar --workspace-root
```

---

### 🟡 MEDIUM ISSUES (Feature Limitations)

#### 4. **Browser Mode Cookie Sync**
- **File**: `src/browser/cookies.ts:50-73`
- **Issue**: `chrome-cookies-secure` uses macOS Keychain access on Mac
- **Windows behavior**: Falls back to reading Chrome's encrypted cookies (may require user password)
- **Limitation**: May not work with Chrome profiles using Windows Credential Manager
- **Status**: Partially functional, requires testing

#### 5. **Chrome Window Hiding**
- **File**: `src/browser/chromeLifecycle.ts:64`
- **Issue**: Uses macOS AppleScript to hide windows
- **Code**: `if (process.platform !== 'darwin') { return; }`
- **Impact**: `--browser-hide-window` flag silently ignored on Windows
- **Status**: Documented limitation (docs/browser-mode.md:38)

#### 6. **Chrome Process Inspection**
- **File**: `scripts/browser-tools.ts:522`
- **Issue**: Uses Unix `ps -ax` command
- **Code**: `if (process.platform !== 'darwin' && process.platform !== 'linux')`
- **Impact**: Cannot list running Chrome processes for debugging on Windows
- **Workaround**: Use Windows Task Manager or `tasklist` manually

#### 7. **File Permissions (chmod)**
- **File**: `src/cli/notifier.ts:159`
- **Issue**: `await fs.chmod(binPath, 0o755);`
- **Platform**: macOS-only code path (`isMacExecError` check at line 145)
- **Impact**: None on Windows (code path skipped)
- **Status**: Safe, but not cross-platform

---

### 🟢 LOW PRIORITY (Cosmetic/Minor)

#### 8. **Terminal Progress Bar Detection**
- **File**: `src/oracle/oscProgress.ts:40-41`
- **Code**: `if (env.WT_SESSION) { return true; }`
- **Status**: ✅ **Correctly implemented**
- **Detection**: Checks for Windows Terminal via `WT_SESSION` env var
- **Support**: OSC 9;4 progress bars work in Windows Terminal

#### 9. **Notification Backend**
- **File**: `src/cli/notifier.ts:78`
- **Implementation**: Uses `toasted-notifier` (cross-platform)
- **Windows backend**: ntfy-toast / SnoreToast (native Windows toasts)
- **Status**: ✅ **Should work** (documented in docs/notifier.md:24)

---

## Test Suite Status

### Tests Skipped on Windows (9 total)

**File**: `tests/oracle-cli.test.ts`

All tests use conditional skip mechanism (line 32):
```typescript
const testNonWindows = process.platform === 'win32' ? test.skip : test;
```

| Line | Test Name | Reason | Severity |
|------|-----------|--------|----------|
| 526 | `accepts directories passed via --file` | Temporary dir cleanup issues | Medium |
| 650 | `readFiles respects glob include/exclude` | Glob path separator handling | **High** |
| 671 | `readFiles skips dotfiles by default` | Dotfile conventions differ | Medium |
| 702 | `readFiles honors .gitignore when present` | Line endings + path separators | **High** |
| 727 | `readFiles honors nested .gitignore files` | Nested path handling | High |
| 766 | `readFiles allows explicitly passed default-ignored dirs` | Path prefix matching | Medium |
| 788 | `readFiles logs and skips default-ignored dirs` | Path manipulation | Medium |
| 625 | `readFiles deduplicates and expands directories` | Temporary FS operations | Low |
| 623 | Inline guard within test | Defensive check | Low |

**Commit history** (most recent first):
- `48f4a63`: ci: skip more readFiles cases on windows
- `9d268a9`: ci: guard remaining readFiles tests on windows
- `28498d4`: test: skip dotfile gitignore readFiles on windows
- `0a15377`: test: skip fragile readFiles cases on windows
- `0c8ded1`: test: skip ignored-dir cases on windows

---

## CI/CD Configuration

### Current Status
- **File**: `.github/workflows/ci.yml`
- **Current setup**: Ubuntu-only build (single OS)
- **Historical**: Commit `160372c` added Windows/macOS matrix but was later removed

### Previous Matrix Config (commit 160372c)
```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]

runs-on: ${{ matrix.os }}
```

**Why removed**: Tests were failing on Windows, CI was simplified to Ubuntu-only

### Current CI Flow
```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm run lint           # TypeScript + Biome
- run: pnpm run test           # Vitest
- run: pnpm run build          # tsc -p tsconfig.build.json
```

**Note**: Build only runs on Ubuntu (`if: matrix.os == 'ubuntu-latest'` in historical version)

---

## Key Files for Windows Testing

### Priority 1 (Must Fix)
1. **`src/oracle/files.ts`** (366 lines)
   - Path normalization (FIXED: `toPosix()` helpers)
   - Glob expansion via `fast-glob`
   - Gitignore parsing
   - Default ignored directories
   - **Status**: Should work now, needs validation

2. **`src/browser/cookies.ts`** (231 lines)
   - Line 202: ✅ Uses `pnpm.cmd` on Windows
   - Line 209: 🔴 **BROKEN** - hardcoded `/usr/bin/python3`
   - SQLite3 native module loading
   - Chrome cookie extraction
   - **Status**: Partially broken, easy fix

3. **`tests/oracle-cli.test.ts`** (9 skipped tests)
   - File system operation tests
   - Glob pattern matching
   - Gitignore handling
   - **Status**: Need to unskip and fix failures

### Priority 2 (Feature Parity)
4. **`src/browser/chromeLifecycle.ts`**
   - Window hiding (macOS-only, document limitation)
   - Chrome launch/shutdown
   - **Status**: Functional but incomplete

5. **`src/browser/actions/promptComposer.ts`**
   - Lines 12-18: ✅ Windows virtual key codes implemented
   - Commit `beaccf7`: Fixed Enter key events for Windows
   - **Status**: Should work

6. **`scripts/browser-tools.ts`**
   - Line 522: Chrome process inspection (Unix-only)
   - **Status**: Nice-to-have, not critical

### Priority 3 (Nice to Have)
7. **`src/cli/notifier.ts`**
   - Cross-platform notifications via `toasted-notifier`
   - macOS-specific native notifier fallback
   - **Status**: Should work via ntfy-toast on Windows

---

## Platform-Specific Code Patterns

### Windows Detection
```typescript
// Command names
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// Terminal detection
if (env.WT_SESSION) { /* Windows Terminal */ }

// macOS-only features
if (process.platform === 'darwin') { /* macOS code */ }
if (process.platform !== 'darwin') { return; /* Skip on Windows/Linux */ }

// Linux headless detection
if (process.platform === 'linux' && !process.env.DISPLAY) { /* Headless */ }
```

### Path Handling
```typescript
// Always use path.sep for splitting
const parts = rel.split(path.sep).filter(Boolean);

// Normalize to POSIX for globs
function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

// Use path.resolve() for absolute paths
const absPath = path.resolve(cwd, relativePath);
```

---

## Dependencies & Tooling

### Runtime Dependencies
| Package | Platform Risk | Notes |
|---------|---------------|-------|
| `chrome-cookies-secure` | **High** | Requires sqlite3 native compilation |
| `sqlite3` | **High** | Needs Python + build tools |
| `keytar` | **High** | Needs node-gyp + Windows SDK |
| `chrome-launcher` | Medium | Should work, uses cross-platform logic |
| `chrome-remote-interface` | Low | Pure JS, works on all platforms |
| `fast-glob` | Low | Cross-platform glob library |
| `toasted-notifier` | Low | Uses ntfy-toast on Windows |

### Build Requirements (Windows)
1. **Node.js 20+** (current CI uses Node 20)
2. **pnpm 10** (package manager)
3. **Python 3.x** (for node-gyp, sqlite3)
4. **Visual Studio Build Tools** or **Windows SDK**
   - C++ build tools
   - Windows 10/11 SDK
5. **node-gyp** globally installed

### Installation on Windows
```powershell
# Install build tools (one-time setup)
npm install -g node-gyp
npm install -g windows-build-tools  # or install VS Build Tools manually

# Set Python path
$env:PYTHON = "python"  # or full path to python.exe

# Install dependencies
pnpm install --frozen-lockfile

# Build native modules (if auto-build fails)
$env:npm_config_build_from_source = "1"
pnpm rebuild chrome-cookies-secure sqlite3 keytar --workspace-root
```

---

## Immediate Windows Blockers

### 🚨 Must Fix Before Full Windows Support

1. **Python path detection** (Priority 1)
   - File: `src/browser/cookies.ts:209`
   - Fix: Auto-detect Python on Windows (`python` vs `/usr/bin/python3`)
   - Effort: 5 minutes

2. **File path normalization validation** (Priority 1)
   - File: `src/oracle/files.ts`
   - Fix: Unskip Windows tests and validate glob/gitignore handling
   - Effort: 2-4 hours (testing + debugging)

3. **Native module compilation** (Priority 1)
   - Issue: `sqlite3`, `keytar`, `chrome-cookies-secure` may fail to build
   - Fix: Document Windows build requirements clearly
   - Add CI step to test Windows compilation
   - Effort: 4-8 hours (setup + validation)

4. **Test suite fixes** (Priority 2)
   - File: `tests/oracle-cli.test.ts`
   - Fix: Address 9 skipped tests one by one
   - Effort: 8-16 hours (depends on root causes)

---

## Testing Strategy for Windows

### Phase 1: Basic Functionality (API Engine)
- [ ] Install on fresh Windows machine
- [ ] Build native modules successfully
- [ ] Run CLI with API engine (`--engine api`)
- [ ] Test file globbing: `--file "src/**/*.ts"`
- [ ] Test exclusions: `--file "src/**/*.ts" --file "!**/*.test.ts"`
- [ ] Test .gitignore respect
- [ ] Validate session storage (`~/.oracle/sessions`)
- [ ] Test notifications (should use ntfy-toast)

### Phase 2: File Operations
- [ ] Test dotfile handling (`.env`, `.gitignore`)
- [ ] Test default-ignored directories (`node_modules`, `dist`)
- [ ] Test nested .gitignore files
- [ ] Test directory expansion
- [ ] Test file deduplication
- [ ] Validate path display (should use forward slashes in output)

### Phase 3: Browser Engine (Optional)
- [ ] Test Chrome cookie extraction
- [ ] Test browser automation (`--engine browser`)
- [ ] Validate remote Chrome connection (`--remote-chrome`)
- [ ] Test file uploads vs inline pasting
- [ ] Confirm window hiding is skipped gracefully

### Phase 4: CI Integration
- [ ] Re-enable Windows in CI matrix
- [ ] Add Windows-specific build steps
- [ ] Cache native modules for faster builds
- [ ] Run full test suite on Windows
- [ ] Address any remaining failures

---

## Configuration Files

### User Config Location
- **macOS/Linux**: `~/.oracle/config.json`
- **Windows**: `%USERPROFILE%\.oracle\config.json`

Format: JSON5 (allows comments and trailing commas)

Example:
```json5
{
  "engine": "api",              // or "browser"
  "model": "gpt-5-pro",
  "notify": {
    "enabled": true,
    "sound": false
  },
  "browser": {
    "chromeProfile": "Default",
    "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  }
}
```

---

## Documentation to Review

| File | Relevance to Windows | Notes |
|------|---------------------|-------|
| `docs/browser-mode.md:38` | High | Documents window hiding limitation |
| `docs/remote-chrome.md` | High | Windows desktop remote Chrome examples |
| `docs/notifier.md:24` | Medium | Documents Windows toast support |
| `docs/configuration.md` | Low | Config file format (platform-agnostic) |
| `CHANGELOG.md:67` | Low | Windows Terminal OSC support |
| `README.md:10` | High | Claims "Windows" support |

---

## Recommended Next Steps

### For Testing (Your Focus)
1. **Quick validation**:
   ```powershell
   # Test if it runs at all
   pnpm install
   pnpm build
   pnpm oracle --help
   ```

2. **Test file operations**:
   ```powershell
   # Create test project structure
   mkdir test-files
   echo "test" > test-files/file1.txt
   echo "test" > test-files/.dotfile

   # Test glob patterns
   pnpm oracle -p "test" --file "test-files/**/*" --dry-run
   pnpm oracle -p "test" --file "test-files/**/*" --file "!**/.dotfile" --dry-run
   ```

3. **Enable debug logging**:
   ```powershell
   pnpm oracle -p "test" --file "." --verbose --dry-run
   ```

4. **Run test suite**:
   ```powershell
   # Run all tests (expect 9 to skip on Windows)
   pnpm test

   # Run with coverage
   pnpm test:coverage
   ```

### For Development (Future)
1. Fix Python path detection in `src/browser/cookies.ts:209`
2. Unskip one Windows test at a time, fix root cause
3. Add Windows to CI matrix with proper build steps
4. Document Windows-specific installation requirements
5. Consider replacing native modules with pure JS alternatives (if possible)

---

## Summary

### What Works on Windows
✅ API engine (OpenAI API calls)
✅ CLI option parsing
✅ Session management
✅ Path normalization (after commit f4d9f82)
✅ Terminal progress bars (Windows Terminal)
✅ Notifications (ntfy-toast backend)
✅ Basic file reading
✅ Command name detection (`pnpm.cmd`)
✅ Browser key events (Enter key fixed in beaccf7)

### What's Broken/Untested
🔴 Hardcoded Python path (`/usr/bin/python3`)
🔴 Native module compilation (needs toolchain)
🟡 Chrome cookie extraction (may work, needs testing)
🟡 File glob operations (9 tests skipped)
🟡 Gitignore handling (needs validation)
🟡 Browser automation (experimental on all platforms)
⚫ Chrome window hiding (macOS-only, by design)
⚫ Chrome process inspection (Unix-only, by design)

### Risk Assessment
| Component | Risk Level | Confidence |
|-----------|------------|------------|
| API Engine | **Low** | High - Should work |
| File Operations | **Medium** | Medium - Mostly fixed, needs validation |
| Native Modules | **High** | Low - Requires build toolchain |
| Browser Engine | **High** | Very Low - Experimental even on macOS |
| Notifications | **Low** | Medium - Uses cross-platform library |

---

**Last Updated**: 2025-11-18
**Branch**: main (commit: b3423d9)
**Status**: Windows support is WIP, API engine should be functional with minor fixes

---

## Recent Fixes (2025-11-18)

### ✅ Completed Fixes
1. **Python path detection** (commit e1afd69)
   - Fixed hardcoded `/usr/bin/python3` → now uses `python` on Windows
   - SQLite3 auto-rebuild now works cross-platform with `ORACLE_ALLOW_SQLITE_REBUILD=1`

2. **Test cleanup** (commit e7b0d34)
   - Removed 5 redundant inline `if (process.platform === 'win32') return;` guards
   - Tests now rely solely on `testNonWindows` skip mechanism
   - Validates confidence in toPosix() path normalization helpers

### 🔍 Ready for Windows Validation
These features use proper path normalization and should work on Windows:
- [ ] File glob patterns (`src/**/*.ts`, `!**/*.test.ts`)
- [ ] .gitignore parsing and path matching
- [ ] Directory expansion and deduplication
- [ ] Dotfile handling (.env, .gitignore)
- [ ] Default ignored directories (node_modules, dist, etc.)

### 📊 Test Status
- **Linux/WSL**: ✅ All 239 tests passing
- **Windows**: ⏳ Needs validation (tests will now run instead of being skipped)
- **macOS**: ✅ Already validated in upstream CI

### 📋 Remaining Work
1. **Immediate**: Test on actual Windows machine
2. **CI Integration**: Add Windows to GitHub Actions matrix
3. **Documentation**: Windows installation guide (Python, VS Build Tools)
4. **Native modules**: Test sqlite3/keytar compilation on Windows

**Updated**: 2025-11-18 (post-fixes)
**Branch**: windows-remote-chrome @ e7b0d34
**Fork**: https://github.com/suits-at/oracle
