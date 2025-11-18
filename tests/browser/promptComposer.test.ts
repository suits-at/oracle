import { describe, expect, test, vi } from 'vitest';
import { submitPrompt } from '../../src/browser/actions/promptComposer.js';
import type { ChromeClient } from '../../src/browser/types.js';

describe('submitPrompt', () => {
  test('falls back to Enter keypress when send button missing', async () => {
    const prompt = 'Hello from Oracle';
    const evaluate = vi.fn();
    const responses = [
      { result: { value: { focused: true } } }, // focus
      { result: { value: { editorText: prompt, fallbackValue: '' } } }, // verification
      { result: { value: 'missing' } }, // send button missing
    ];
    evaluate.mockImplementation(async () => responses.shift() ?? { result: { value: { userMatched: true } } });
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];
    const insertText = vi.fn().mockResolvedValue(undefined);
    const dispatchKeyEvent = vi.fn().mockResolvedValue(undefined);
    const input = { insertText, dispatchKeyEvent } as unknown as ChromeClient['Input'];
    const logger = vi.fn();

    await submitPrompt({ runtime, input }, prompt, logger);

    expect(insertText).toHaveBeenCalledWith({ text: prompt });
    expect(dispatchKeyEvent).toHaveBeenCalledTimes(2);
    expect(dispatchKeyEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        text: '\r',
        unmodifiedText: '\r',
      }),
    );
    expect(dispatchKeyEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
      }),
    );
    expect(logger).toHaveBeenCalledWith('Submitted prompt via Enter key');
  });
});
