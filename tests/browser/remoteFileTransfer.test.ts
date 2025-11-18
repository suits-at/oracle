import { describe, expect, test, vi, beforeEach } from 'vitest';
import { uploadAttachmentViaDataTransfer } from '../../src/browser/actions/remoteFileTransfer.js';
import type { ChromeClient } from '../../src/browser/types.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('hello world')),
}));

const runtimeFactory = (): ChromeClient['Runtime'] =>
  ({
    evaluate: vi
      .fn()
      .mockResolvedValueOnce({ result: { value: { success: true, fileName: 'note.txt', size: 11 } } })
      .mockResolvedValueOnce({ result: { value: true } }),
  }) as unknown as ChromeClient['Runtime'];

const domFactory = (): ChromeClient['DOM'] =>
  ({
    getDocument: vi.fn().mockResolvedValue({ root: { nodeId: 1 } }),
    querySelector: vi.fn().mockResolvedValue({ nodeId: 2 }),
  }) as unknown as ChromeClient['DOM'];

describe('uploadAttachmentViaDataTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('injects file payload and waits for recognition', async () => {
    const runtime = runtimeFactory();
    const dom = domFactory();
    const logger = vi.fn();

    await expect(
      uploadAttachmentViaDataTransfer(
        { runtime, dom },
        { path: '/tmp/note.txt', displayPath: 'note.txt' },
        logger,
      ),
    ).resolves.toBeUndefined();

    expect(dom.getDocument).toHaveBeenCalled();
    expect(runtime.evaluate).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('note.txt'));
  });
});
