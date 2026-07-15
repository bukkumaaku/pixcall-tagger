# Pixcall AI Tagger Plugin

Vue modal command plugin for Pixcall 0.9.5 or newer. The installable development plugin is generated at `dist`.

```powershell
npm run build
```

The frontend obtains `serverPort`, `settings`, and `initMessage` from `window.pixcall`. It starts the bundled native worker through Pixcall's `spawn_child_process` request. The short-lived worker launcher detaches a localhost HTTP worker on port `22511`; requests require the `X-Pixcall-AI-Token` header.

The repository is the Pixcall plugin; `backend/` contains the native ai-worker and `dist/` is the installable plugin package.
