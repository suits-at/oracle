#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Rebuild native Node.js modules for Oracle on Windows
.DESCRIPTION
    This script rebuilds win-dpapi, chrome-cookies-secure, sqlite3, and keytar
    native modules required for browser mode cookie sync.
.NOTES
    Prerequisites:
    - Visual Studio Build Tools with "Desktop development with C++" workload
    - Python 3.x
    - node-gyp (will be checked and installed if missing)
#>

$ErrorActionPreference = "Stop"

Write-Host "=== Oracle Native Module Rebuild Script ===" -ForegroundColor Cyan
Write-Host ""

# Check for Python
Write-Host "[1/6] Checking Python..." -ForegroundColor Yellow
$pythonPath = $null
$pythonCommands = @("python", "python3", "py")

foreach ($cmd in $pythonCommands) {
    try {
        $version = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pythonPath = $cmd
            Write-Host "  ✓ Found: $version" -ForegroundColor Green
            break
        }
    } catch {
        continue
    }
}

if (-not $pythonPath) {
    Write-Host "  ✗ Python not found. Please install Python 3.x from https://www.python.org/" -ForegroundColor Red
    exit 1
}

# Check for Visual Studio Build Tools
Write-Host ""
Write-Host "[2/6] Checking Visual Studio Build Tools..." -ForegroundColor Yellow

$vsWherePath = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$buildToolsFound = $false

if (Test-Path $vsWherePath) {
    $vsInstances = & $vsWherePath -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json | ConvertFrom-Json
    if ($vsInstances.Count -gt 0) {
        $buildToolsFound = $true
        $vsPath = $vsInstances[0].installationPath
        Write-Host "  ✓ Found Visual Studio Build Tools at: $vsPath" -ForegroundColor Green
    }
}

if (-not $buildToolsFound) {
    Write-Host "  ✗ Visual Studio Build Tools not found or C++ tools not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Visual Studio Build Tools with:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://visualstudio.microsoft.com/downloads/" -ForegroundColor White
    Write-Host "  2. Select 'Desktop development with C++' workload" -ForegroundColor White
    Write-Host "  3. Install and run this script again" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        exit 1
    }
}

# Check for node-gyp
Write-Host ""
Write-Host "[3/6] Checking node-gyp..." -ForegroundColor Yellow

try {
    $nodeGypVersion = & node-gyp --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Found: node-gyp v$nodeGypVersion" -ForegroundColor Green
    } else {
        throw "node-gyp not found"
    }
} catch {
    Write-Host "  ! node-gyp not found, installing..." -ForegroundColor Yellow
    npm install -g node-gyp
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to install node-gyp" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Installed node-gyp" -ForegroundColor Green
}

# Set environment variables
Write-Host ""
Write-Host "[4/6] Setting environment variables..." -ForegroundColor Yellow

$env:PYTHON = $pythonPath
$env:npm_config_build_from_source = "1"

Write-Host "  PYTHON = $pythonPath" -ForegroundColor Gray
Write-Host "  npm_config_build_from_source = 1" -ForegroundColor Gray

# Rebuild native modules
Write-Host ""
Write-Host "[5/6] Rebuilding native modules..." -ForegroundColor Yellow
Write-Host "  This may take 2-5 minutes..." -ForegroundColor Gray
Write-Host ""

$modules = @("win-dpapi", "chrome-cookies-secure", "sqlite3", "keytar")

foreach ($module in $modules) {
    Write-Host "  Rebuilding $module..." -ForegroundColor Gray
    & pnpm rebuild $module

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  ✗ Rebuild failed for $module with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host ""
        Write-Host "Common issues:" -ForegroundColor Yellow
        Write-Host "  - Make sure you opened PowerShell AFTER installing Build Tools" -ForegroundColor White
        Write-Host "  - Try opening 'Developer PowerShell for VS 2022' from Start menu" -ForegroundColor White
        Write-Host "  - Restart your computer after installing Build Tools" -ForegroundColor White
        exit 1
    }
    Write-Host "  ✓ $module rebuilt successfully" -ForegroundColor Green
}

Write-Host ""
Write-Host "  ✓ All native modules rebuilt successfully" -ForegroundColor Green

# Test if modules load
Write-Host ""
Write-Host "[6/6] Testing module loading..." -ForegroundColor Yellow

$testScript = @'
(async () => {
  try {
    const chromeCookies = await import('chrome-cookies-secure');
    console.log('  ✓ chrome-cookies-secure loads successfully (includes win-dpapi)');
  } catch (e) {
    console.log('  ✗ chrome-cookies-secure failed:', e.message);
    console.log('');
    console.log('This usually means win-dpapi failed to build.');
    process.exit(1);
  }

  try {
    const sqlite3 = await import('sqlite3');
    console.log('  ✓ sqlite3 loads successfully');
  } catch (e) {
    console.log('  ✗ sqlite3 failed:', e.message);
    process.exit(1);
  }

  try {
    const keytar = await import('keytar');
    console.log('  ✓ keytar loads successfully');
  } catch (e) {
    console.log('  ✗ keytar failed:', e.message);
    process.exit(1);
  }

  console.log('');
  console.log('=== All native modules loaded successfully! ===');
  console.log('');
  console.log('You can now use browser mode with cookie sync:');
  console.log('  pnpm run oracle -- --engine browser --prompt "test"');
  console.log('');
})();
'@

$testScript | Out-File -FilePath "test-native-modules.mjs" -Encoding utf8

node test-native-modules.mjs

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ SUCCESS: Cookie sync should now work!" -ForegroundColor Green
} else {
    Write-Host "✗ Module loading failed. Check errors above." -ForegroundColor Red
    exit 1
}

# Cleanup
Remove-Item "test-native-modules.mjs" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
