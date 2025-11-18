# Remote Chrome Mode

Oracle can drive a Chrome or Edge instance that is already running on another machine (for example, a Windows desktop) by pointing the CLI at the remote DevTools endpoint. This lets you keep a GUI browser signed into ChatGPT while triggering runs from WSL2, headless Linux boxes, or CI hosts.

## Prerequisites

1. On the machine with the browser UI, launch Chrome/Edge with remote debugging enabled. Example:
   ```powershell
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0
   ```
   This keeps your normal profile, cookies, and tabs intact.
2. Ensure the CLI machine can reach `<host>:<port>` over the network (LAN, port forwarding, etc.).

## Running Oracle

Use the `--remote-chrome <host:port>` flag together with `--engine browser`. Example from WSL2:

```bash
pnpm run oracle -- --engine browser \
  --remote-chrome windows-host.local:9222 \
  --prompt "Summarize today's logs" \
  --file logs/today.txt
```

Key behaviors:

- Oracle opens a dedicated tab targeting `--browser-url` (defaults to `https://chatgpt.com/`), runs the whole automation there, then closes the tab when done. Other tabs remain untouched.
- Cookie sync is skipped in remote mode; the remote browser keeps its own session.
- Attachments are transferred over CDP: Oracle reads each file locally, streams it to the remote DOM, assigns it to the hidden `<input type="file">`, and waits until the ChatGPT UI acknowledges the upload before sending the prompt.

## Troubleshooting

- **Invalid host:port** – the CLI validates the `--remote-chrome` flag and fails fast if the port is missing or non-numeric.
- **Connection refused** – verify Chrome is listening on the specified port and that firewalls allow inbound traffic.
- **Attachment stalls** – watch the verbose logs; Oracle records every transfer and surfaces DOM snapshots when ChatGPT fails to register the file.
- **Multiple runs** – each Oracle run opens its own tab; if you kill the CLI before completion, close the orphaned tab manually or let Chrome’s “close DevTools target” timeout reclaim it.

For a quick connectivity check, use `pnpm tsx scripts/test-remote-chrome.ts <host> [port]`. It pings the DevTools endpoint, navigates to ChatGPT, and prints whether the composer is available.
