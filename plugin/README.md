# Pixcall AI Tagger Plugin

Vue modal command plugin for Pixcall 0.9.5 or newer. The installable development plugin is generated at `plugin/dist`.

```powershell
npm run plugin:build
```

The plugin frontend obtains `serverPort`, `settings`, and `initMessage` from `window.pixcall`. It starts the bundled native worker through Pixcall's `spawn_child_process` request. The short-lived worker launcher detaches a localhost HTTP worker on port `22511`; requests require the `X-Pixcall-AI-Token` header.

The plugin and Tauri application share the model directory and user configuration, but the plugin remains a separate frontend build.
