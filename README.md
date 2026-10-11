# NOVA - Personal AI Assistant for Windows 11

A desktop assistant built with Electron + Node.js. It chats using a **local model (Ollama)** and/or **OpenAI**, speaks answers, and can perform a small, safe list of Windows actions.

> Status: first version. The unit tests pass (`npm test`), but you should run the app yourself on Windows and follow the checklist at the bottom. It is not production-hardened.

## 1. Requirements
- Windows 11
- Node.js 20 or newer (22 LTS recommended) and npm. Check with `node -v` and `npm -v`.
- Optional: [Ollama](https://ollama.com) for offline AI; an OpenAI API key for online AI.

## 2. Install and run
```powershell
cd nova-personal-ai
npm install dotenv
npm install --save-dev electron electron-builder
npm start
```
(Installing without version numbers gets the current releases and records them in `package.json` and `package-lock.json`.)

Run tests (no internet, Ollama, or API key needed): `npm test`

## 3. Local AI with Ollama
1. Install: download from ollama.com, or `winget install Ollama.Ollama`.
2. Download a model and test it:
   ```powershell
   ollama pull llama3.2:3b
   ollama run llama3.2:3b "Say hello"
   ```
3. Start NOVA. The status light in the top bar shows "Local model ready" when Ollama is running and the model named in Settings is installed. If it says "Local model missing", run the `ollama pull` command shown in the error.

## 4. Optional online AI (OpenAI)
1. Copy `.env.example` to `.env` and put your key after `OPENAI_API_KEY=`. `.env` is git-ignored; never commit it.
2. Check OpenAI's documentation for current model names and change **Online model** in Settings if needed (the default `gpt-4.1-mini` is only an example).
3. **API usage is billed separately by OpenAI.** In online mode (or hybrid fallback) NOVA sends your message plus up to the last 20 chat messages to OpenAI. Action commands (open Notepad, notes, timers) and their results are never included. The key is read only by the main process; it is not stored in settings or visible to the UI.

For an installed build, put the `.env` file in `%APPDATA%\nova-personal-ai\` instead.

## 4b. Optional online AI (Google Gemini)
1. Create a key in Google AI Studio and add it to `.env`: `GEMINI_API_KEY=...` (check Google's docs for current model names and limits; the default `gemini-2.5-flash` is only an example, change it in Settings if needed).
2. Pick **Online only (Gemini)** in the top bar, or choose Gemini as the **Hybrid fallback provider** in Settings.
3. Like OpenAI, Gemini receives your message and recent chat context. Free tiers have limits; read Google's terms about data use.

## 5. Modes (top-bar selector, also in Settings)
| Mode | Behavior |
|---|---|
| Offline only | Ollama only. Nothing is ever sent online. The Ollama URL must be localhost. |
| Online only (OpenAI) / (Gemini) | The chosen provider only. |
| Hybrid (default) | Tries Ollama first. Falls back to the provider chosen in Settings (OpenAI or Gemini) **only** if you ticked the fallback checkbox and that provider's key exists. Otherwise you get a clear error and nothing is sent. |

Each answer shows which provider and model produced it. A model's answer is never labelled as coming from a different provider.

## 6. Commands NOVA understands
"Open Calculator", "Open Notepad", "Open Google / YouTube / GitHub / the VS Code website", "Open my folder", "Open NOVA Notes", "Create a note: buy milk" (asks for confirmation; saved as a timestamped file in `Documents\NOVA Notes`, never overwriting), "What time is it?", "Set a five-minute timer".
Anything else that sounds like a PC command (delete, run PowerShell, open other programs) is refused. Other messages go to the AI. There is no shell, PowerShell, or CMD access.
Timers only work while NOVA is open.

## 7. Voice
- Mic button: speech-to-text via the browser Web Speech API. **It normally needs an internet connection** (Chromium sends audio to a speech service), and **may not work at all inside Electron**, which often reports a "network" error. NOVA shows a clear message and typing keeps working. This version is *not* an offline voice system.
- Speaking: uses Windows voices via SpeechSynthesis (offline). Use the speaker button to toggle and the stop button to interrupt.
- Microphone permission: Windows Settings > Privacy & security > Microphone > allow desktop apps.
- A local engine (for example Whisper or Vosk) can be added later by supplying another `createRecognizer` in `src/renderer/modules/voice.js`.

## 8. Privacy
Chat history is saved locally in `%APPDATA%\nova-personal-ai\history.json`; clear it in Settings. Nothing is uploaded unless you use online mode/fallback. NOVA does not read your files or collect system information.

## 9. Troubleshooting
- **"Cannot reach Ollama"**: start the Ollama app, or run `ollama serve`; check the URL in Settings (default `http://127.0.0.1:11434`).
- **"Model is not installed"**: `ollama pull <model>` using the exact name in Settings.
- **"No OpenAI API key"/"rejected the API key"**: check `.env`, then restart NOVA (the file is read at startup).
- **Rate limit / quota error**: check your OpenAI billing.
- **`electron` is not recognized**: run `npm install --save-dev electron` first.
- **Mic does nothing / "network" error**: see Voice above.
- **Build fails with a symlink permission error**: enable Windows Developer Mode or run the terminal as administrator.

## 10. Build a Windows installer
```powershell
npm run build
```
The installer appears in `dist/`. It is unsigned, so Windows SmartScreen may warn.

## 11. First-run checklist (not yet verified on a real Windows machine)
- [ ] `npm start` opens the window
- [ ] Type "hello" and get a reply with a provider label
- [ ] "Open Calculator" opens Calculator
- [ ] "Create a note: test" asks to confirm, then a file appears in Documents\NOVA Notes
- [ ] Offline-only mode with Ollama stopped shows an error and sends nothing online
