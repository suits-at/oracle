import { CHATGPT_URL, DEFAULT_MODEL_TARGET } from './constants.js';
import type { BrowserAutomationConfig, ResolvedBrowserConfig } from './types.js';

export const DEFAULT_BROWSER_CONFIG: ResolvedBrowserConfig = {
  chromeProfile: null,
  chromePath: null,
  url: CHATGPT_URL,
  timeoutMs: 900_000,
  inputTimeoutMs: 30_000,
  cookieSync: true,
  headless: false,
  keepBrowser: false,
  hideWindow: false,
  desiredModel: DEFAULT_MODEL_TARGET,
  debug: false,
  allowCookieErrors: false,
  remoteChrome: null,
};

export function resolveBrowserConfig(config: BrowserAutomationConfig | undefined): ResolvedBrowserConfig {
  return {
    ...DEFAULT_BROWSER_CONFIG,
    ...(config ?? {}),
    url: config?.url ?? DEFAULT_BROWSER_CONFIG.url,
    timeoutMs: config?.timeoutMs ?? DEFAULT_BROWSER_CONFIG.timeoutMs,
    inputTimeoutMs: config?.inputTimeoutMs ?? DEFAULT_BROWSER_CONFIG.inputTimeoutMs,
    cookieSync: config?.cookieSync ?? DEFAULT_BROWSER_CONFIG.cookieSync,
    headless: config?.headless ?? DEFAULT_BROWSER_CONFIG.headless,
    keepBrowser: config?.keepBrowser ?? DEFAULT_BROWSER_CONFIG.keepBrowser,
    hideWindow: config?.hideWindow ?? DEFAULT_BROWSER_CONFIG.hideWindow,
    desiredModel: config?.desiredModel ?? DEFAULT_BROWSER_CONFIG.desiredModel,
    chromeProfile: config?.chromeProfile ?? DEFAULT_BROWSER_CONFIG.chromeProfile,
    chromePath: config?.chromePath ?? DEFAULT_BROWSER_CONFIG.chromePath,
    debug: config?.debug ?? DEFAULT_BROWSER_CONFIG.debug,
    allowCookieErrors: config?.allowCookieErrors ?? DEFAULT_BROWSER_CONFIG.allowCookieErrors,
  };
}
