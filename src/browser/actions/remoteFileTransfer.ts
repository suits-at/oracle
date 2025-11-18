import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChromeClient, BrowserAttachment, BrowserLogger } from '../types.js';
import { FILE_INPUT_SELECTOR, GENERIC_FILE_INPUT_SELECTOR } from '../constants.js';
import { delay } from '../utils.js';
import { logDomFailure } from '../domDebug.js';

/**
 * Upload file to remote Chrome by transferring content via CDP
 * Used when browser is on a different machine than CLI
 */
export async function uploadAttachmentViaDataTransfer(
  deps: { runtime: ChromeClient['Runtime']; dom?: ChromeClient['DOM'] },
  attachment: BrowserAttachment,
  logger: BrowserLogger,
): Promise<void> {
  const { runtime, dom } = deps;
  if (!dom) {
    throw new Error('DOM domain unavailable while uploading attachments.');
  }

  // Read file content from local filesystem
  const fileContent = await readFile(attachment.path);
  const base64Content = fileContent.toString('base64');
  const fileName = path.basename(attachment.path);
  const mimeType = guessMimeType(fileName);

  logger(`Transferring ${fileName} (${fileContent.length} bytes) to remote browser...`);

  // Find file input element
  const documentNode = await dom.getDocument();
  const selectors = [FILE_INPUT_SELECTOR, GENERIC_FILE_INPUT_SELECTOR];
  let fileInputSelector: string | undefined;

  for (const selector of selectors) {
    const result = await dom.querySelector({ nodeId: documentNode.root.nodeId, selector });
    if (result.nodeId) {
      fileInputSelector = selector;
      break;
    }
  }

  if (!fileInputSelector) {
    await logDomFailure(runtime, logger, 'file-input');
    throw new Error('Unable to locate ChatGPT file attachment input.');
  }

  // Inject file via JavaScript DataTransfer API
  const expression = `
    (function() {
      const fileInput = document.querySelector(${JSON.stringify(fileInputSelector)});
      if (!fileInput) {
        return { success: false, error: 'File input not found' };
      }

      const base64Data = ${JSON.stringify(base64Content)};
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: ${JSON.stringify(mimeType)} });
      const file = new File([blob], ${JSON.stringify(fileName)}, {
        type: ${JSON.stringify(mimeType)},
        lastModified: Date.now()
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const proto = Object.getPrototypeOf(fileInput);
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'files') : null;
      let assigned = false;
      if (descriptor?.set) {
        try {
          descriptor.set.call(fileInput, dataTransfer.files);
          assigned = true;
        } catch {
          assigned = false;
        }
      }
      if (!assigned) {
        try {
          Object.defineProperty(fileInput, 'files', {
            configurable: true,
            get: () => dataTransfer.files,
          });
          assigned = true;
        } catch {
          assigned = false;
        }
      }
      if (!assigned) {
        return { success: false, error: 'Unable to assign FileList to input' };
      }

      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      return { success: true, fileName: file.name, size: file.size };
    })()
  `;

  const { result } = await runtime.evaluate({ expression, returnByValue: true });
  const uploadResult = result.value as { success?: boolean; error?: string; fileName?: string; size?: number };

  if (!uploadResult?.success) {
    throw new Error(`Failed to transfer file to remote browser: ${uploadResult?.error || 'Unknown error'}`);
  }

  logger(`File transferred: ${uploadResult.fileName} (${uploadResult.size} bytes)`);
  await waitForAttachmentRecognition(runtime, fileName, 10_000);
  logger(`Attachment queued: ${attachment.displayPath}`);
}

async function waitForAttachmentRecognition(
  Runtime: ChromeClient['Runtime'],
  expectedFileName: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const checkExpression = `
    (() => {
      // Check for any file attachment indicators in the composer
      const indicators = [
        // Look for file name in any element
        ...Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent || '';
          return text.includes(${JSON.stringify(expectedFileName)}) &&
                 el.getBoundingClientRect().height > 0;
        }),
        // Look for file input that has files
        ...Array.from(document.querySelectorAll('input[type="file"]')).filter(input => {
          return input.files && input.files.length > 0;
        })
      ];

      return indicators.length > 0;
    })()
  `;

  while (Date.now() < deadline) {
    const { result } = await Runtime.evaluate({ expression: checkExpression, returnByValue: true });
    if (result.value === true) {
      return;
    }
    await delay(250);
  }

  throw new Error(`Attachment ${expectedFileName} did not register with ChatGPT composer in time.`);
}

function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.jsx': 'text/javascript',
    '.tsx': 'text/typescript',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.hpp': 'text/x-c++',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'text/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.sh': 'text/x-sh',
    '.bash': 'text/x-sh',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.zip': 'application/zip',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
