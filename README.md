# State Bridge

State Bridge is a Chrome extension for copying browser storage from one tab into another so a production session can be replayed locally during debugging.

The extension is built for engineers who need to reproduce production-only bugs without manually logging in and clicking through the same setup flow on `localhost`.

## What It Does

- Captures `localStorage` from a source tab.
- Captures `sessionStorage` from a source tab.
- Applies the latest captured snapshot into a target tab.
- Reloads the target tab after apply.
- Protects apply targets with an allowlist and an explicit override flow.

## What It Does Not Do

- It does not copy cookies.
- It does not copy IndexedDB.
- It does not copy in-memory application state.
- It does not publish to the Chrome Web Store.

## How It Works

1. Open the source tab, usually production or staging.
2. Open the target tab, usually `localhost` or another development environment.
3. In the source tab, click `Capture`.
4. Switch to the target tab and click `Apply`.
5. The extension writes the selected storage into the target origin and reloads the page.

The popup is intentionally small and minimal:
- storage toggles
- latest snapshot summary
- capture/apply actions
- allowlist override only when needed

## Permissions

The extension requests:

- `storage`: stores the latest snapshot and settings.
- `scripting`: injects capture/apply code into the current tab.
- `tabs`: resolves the active source and target tabs.
- `host_permissions` for `http://*/*` and `https://*/*`: required so the extension can read from a source tab and write to a target tab across arbitrary origins during development.

These permissions are broad by design because the tool is meant for local debugging across production, staging, and localhost environments. This extension should be treated as a developer tool, not as an end-user extension.

## Install

### Requirements

- Node.js
- `pnpm`
- Chrome or another Chromium-based browser

### Load The Extension Locally

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Build the extension:

   ```bash
   pnpm build
   ```

3. Open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the `dist/` directory from this repository.

## Usage

### Typical Production-To-Local Flow

1. Open the production tab that already contains the state you want.
2. Open the local development tab, for example `http://localhost:3000`.
3. On the production tab, open State Bridge and click `Capture`.
4. On the local tab, open State Bridge and click `Apply`.
5. If the target is outside the allowlist, review the warning and use explicit override only if you really intend to write there.

### Configure Target Allowlist

1. Open the extension popup.
2. Click `Options`.
3. Add one rule per line, for example:

   ```text
   localhost
   127.0.0.1
   *.local
   *.dev.example.com
   ```

4. Click `Save`.

## Development

### Commands

```bash
pnpm build
pnpm dev
pnpm typecheck
pnpm test:unit
pnpm test:e2e
```

### Notes

- `pnpm dev` runs Vite in watch mode for the unpacked extension build.
- Reload the extension in `chrome://extensions` after rebuilding.
- `pnpm test:e2e` launches a dedicated Chromium instance with the unpacked extension loaded. It does not use your daily browser profile.

## Safety Notes

- Use this only for development and debugging.
- Be careful when copying real user state into a local environment.
- Avoid applying snapshots into tabs you do not control.
- Review the allowlist before using explicit override.

## Publishing This Repository To GitHub

This repository is intended to be published with a squashed public history, not with the current local working history.

### Recommended Public Release Flow

1. Run the final checks:

   ```bash
   pnpm typecheck
   pnpm test:unit
   pnpm test:e2e
   gitleaks git --no-banner
   gitleaks dir . --no-banner
   ```

2. Create a clean public branch from the current code:

   ```bash
   git checkout --orphan public-main
   git add .
   git commit -m "feat(extension): initial public release"
   ```

3. Install GitHub CLI if needed:

   ```bash
   brew install gh
   ```

4. Authenticate:

   ```bash
   gh auth login
   ```

5. Create the public repository and push:

   ```bash
   gh repo create state-bridge --public --source=. --remote=origin --push
   ```

### Manual Fallback

If you do not want to use `gh`, create the GitHub repository in the web UI, add the remote manually, and push the squashed public branch yourself.

## License

MIT. See [LICENSE](./LICENSE).
