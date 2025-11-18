import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import CDP from 'chrome-remote-interface';
import { launch, type LaunchedChrome } from 'chrome-launcher';
import type { BrowserLogger, ResolvedBrowserConfig, ChromeClient } from './types.js';

const execFileAsync = promisify(execFile);

export async function launchChrome(config: ResolvedBrowserConfig, userDataDir: string, logger: BrowserLogger) {
  const chromeFlags = buildChromeFlags(config.headless);
  const launcher = await launch({
    chromePath: config.chromePath ?? undefined,
    chromeFlags,
    userDataDir,
  });
  const pidLabel = typeof launcher.pid === 'number' ? ` (pid ${launcher.pid})` : '';
  logger(`Launched Chrome${pidLabel} on port ${launcher.port}`);
  return launcher;
}

export function registerTerminationHooks(
  chrome: LaunchedChrome,
  userDataDir: string,
  keepBrowser: boolean,
  logger: BrowserLogger,
): () => void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  let handling: boolean | undefined;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (handling) {
      return;
    }
    handling = true;
    logger(`Received ${signal}; terminating Chrome process`);
    void (async () => {
      try {
        await chrome.kill();
      } catch {
        // ignore kill failures
      }
      if (!keepBrowser) {
        await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    })().finally(() => {
      const exitCode = signal === 'SIGINT' ? 130 : 1;
      process.exit(exitCode);
    });
  };

  for (const signal of signals) {
    process.on(signal, handleSignal);
  }

  return () => {
    for (const signal of signals) {
      process.removeListener(signal, handleSignal);
    }
  };
}

export async function hideChromeWindow(chrome: LaunchedChrome, logger: BrowserLogger): Promise<void> {
  if (process.platform !== 'darwin') {
    logger('Window hiding is only supported on macOS');
    return;
  }
  if (!chrome.pid) {
    logger('Unable to hide window: missing Chrome PID');
    return;
  }
  const script = `tell application "System Events"
    try
      set visible of (first process whose unix id is ${chrome.pid}) to false
    end try
  end tell`;
  try {
    await execFileAsync('osascript', ['-e', script]);
    logger('Chrome window hidden (Cmd-H)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to hide Chrome window: ${message}`);
  }
}

export async function connectToChrome(port: number, logger: BrowserLogger): Promise<ChromeClient> {
  const client = await CDP({ port });
  logger('Connected to Chrome DevTools protocol');
  return client;
}

export interface RemoteChromeConnection {
  client: ChromeClient;
  targetId?: string;
}

export async function connectToRemoteChrome(
  host: string,
  port: number,
  logger: BrowserLogger,
  targetUrl?: string,
): Promise<RemoteChromeConnection> {
  if (targetUrl) {
    try {
      const target = await CDP.New({ host, port, url: targetUrl });
      const client = await CDP({ host, port, target: target.id });
      logger(`Opened dedicated remote Chrome tab targeting ${targetUrl}`);
      return { client, targetId: target.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to open dedicated remote Chrome tab (${message}); falling back to first target.`);
    }
  }
  const fallbackClient = await CDP({ host, port });
  logger(`Connected to remote Chrome DevTools protocol at ${host}:${port}`);
  return { client: fallbackClient };
}

export async function closeRemoteChromeTarget(
  host: string,
  port: number,
  targetId: string | undefined,
  logger: BrowserLogger,
): Promise<void> {
  if (!targetId) {
    return;
  }
  try {
    await CDP.Close({ host, port, id: targetId });
    if (logger.verbose) {
      logger(`Closed remote Chrome tab ${targetId}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to close remote Chrome tab ${targetId}: ${message}`);
  }
}

function buildChromeFlags(headless: boolean): string[] {
  const flags = [
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-default-apps',
    '--disable-hang-monitor',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    '--disable-features=TranslateUI,AutomationControlled',
    '--mute-audio',
    '--window-size=1280,720',
    '--password-store=basic',
    '--use-mock-keychain',
  ];

  if (headless) {
    flags.push('--headless=new');
  }

  return flags;
}
