#!/usr/bin/env node
/**
 * Cross-platform vendor build script
 * Copies vendor/oracle-notifier to dist/vendor/oracle-notifier
 * Gracefully handles missing source directory (macOS-only feature)
 */

import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const sourceDir = join(projectRoot, 'vendor', 'oracle-notifier');
const targetDir = join(projectRoot, 'dist', 'vendor', 'oracle-notifier');

try {
  // Only copy if source exists (macOS-only vendor)
  if (!existsSync(sourceDir)) {
    console.log('[build:vendor] Skipping vendor copy (source not found, macOS-only)');
    process.exit(0);
  }

  // Create target directory (recursive)
  mkdirSync(dirname(targetDir), { recursive: true });

  // Copy vendor directory
  cpSync(sourceDir, targetDir, { recursive: true });

  console.log('[build:vendor] Copied vendor/oracle-notifier to dist/vendor/oracle-notifier');
} catch (error) {
  // Vendor copy is optional, don't fail the build
  console.warn('[build:vendor] Warning:', error.message);
  console.log('[build:vendor] Continuing build (vendor copy is optional)');
}
