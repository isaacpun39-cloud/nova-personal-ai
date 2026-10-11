# NOVA architecture

```
Renderer (sandboxed UI)  --window.nova.*-->  Preload (contextBridge)  --IPC-->  Main process
  chat / voice / settings                      6 named functions only             validators -> router -> services
```

- **Main** (`src/main`): window, settings/history storage, AI providers, allowlisted PC actions. Every IPC payload is validated in `validators.js`, and `registerIpc` rejects senders other than the app window.
- **Preload** (`src/preload/preload.js`): exposes `chat`, `status`, `getSettings`, `setSettings`, `getHistory`, `clearHistory`, `onTimerDone`. No Node, no env, no raw `ipcRenderer`.
- **Renderer** (`src/renderer`): plain HTML/CSS/ES modules. Text is displayed with `textContent` only.

## Message flow
1. `commandRouter.routeCommand(text)` returns `action`, `unsupported`, or `question` using fixed regex patterns (whole-message match, so "how do I open Calculator?" is a question).
2. Actions run through `pcActions` (fixed app names, fixed URLs, `spawn` with `shell:false`). Consequential actions (notes) need confirmation.
3. Questions go to `aiService.send`: `offline` -> Ollama only, `online` -> OpenAI only, `hybrid` -> Ollama first, then OpenAI only if the local failure was "unavailable/missing/timeout" AND "allow online fallback" is on AND a key exists.
4. Every AI answer returns `provider` + `model`, shown under the message.

## Adding things later
- New AI provider: add a `create...Provider()` returning `{ chat(messages) }` in `aiService.js` and wire it into `send`.
- Local speech recognition: pass a different `createRecognizer` to `createVoice` in `voice.js` (same start/stop interface).
- New PC action: add a handler in `pcActions.js`, a pattern in `commandRouter.js`, and tests.
