import { createChat, providerLabel } from './modules/chat.js';
import { createVoice } from './modules/voice.js';
import { createSettingsPanel } from './modules/settings.js';

const $ = (id) => document.getElementById(id);
const chat = createChat($('messages'));
let busy = false;
let speakOn = true;

function showNotice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

const voice = createVoice({
  getLanguage: () => (settings.get() && settings.get().language) || 'en-US',
  onTranscript: (text) => { $('input').value = text; send(text); },
  onState: (state) => {
    $('micBtn').classList.toggle('listening', state === 'listening');
    $('micBtn').setAttribute('aria-label', state === 'listening' ? 'Stop voice input' : 'Start voice input');
    if (state === 'listening') showNotice('');
  },
  onError: showNotice,
});

const settings = createSettingsPanel({
  dialog: $('settingsDialog'),
  form: $('settingsForm'),
  messageEl: $('settingsMsg'),
  onSaved: (s) => { $('provider').value = s.provider; refreshStatus(); },
  onHistoryCleared: () => chat.clear(),
});

async function refreshStatus() {
  const st = await window.nova.status();
  const el = $('status');
  let cls = 'ok';
  let text;
  if (st.kind === 'error') { cls = 'err'; text = 'Status unavailable'; }
  else if (st.provider === 'gemini') { cls = st.gemini.configured ? 'ok' : 'err'; text = st.gemini.configured ? 'Online (Gemini)' : 'No Gemini key'; }
  else if (st.provider === 'online') { cls = st.openai.configured ? 'ok' : 'err'; text = st.openai.configured ? 'Online (OpenAI)' : 'No API key'; }
  else if (st.ollama.state === 'ready') text = st.provider === 'offline' ? 'Local model ready' : 'Hybrid · local ready';
  else { cls = st.provider === 'offline' ? 'err' : 'warn'; text = st.ollama.state === 'model-missing' ? 'Local model missing' : 'Ollama not running'; }
  el.className = `status ${cls}`;
  el.title = (st.ollama && st.ollama.message) || '';
  $('statusText').textContent = text;
}

async function send(rawText) {
  const text = rawText.trim();
  if (!text || busy) return;
  busy = true;
  $('input').value = '';
  $('sendBtn').disabled = true;
  showNotice('');
  chat.add('user', text);
  const pending = chat.add('assistant', 'NOVA is thinking…', { pending: true });
  try {
    let res = await window.nova.chat(text, false);
    if (res.kind === 'confirm') {
      res = window.confirm(res.text) ? await window.nova.chat(text, true) : { kind: 'action', text: 'Cancelled. Nothing was changed.' };
    }
    pending.remove();
    const isError = res.kind === 'error' || res.kind === 'unsupported' || (res.kind === 'action' && res.ok === false);
    const label = res.kind === 'ai' ? providerLabel(res.provider, res.model) : res.kind === 'action' ? 'NOVA action' : '';
    chat.add('assistant', res.text, { label, error: isError });
    if (speakOn && !isError) voice.speak(res.text);
  } catch {
    pending.remove();
    chat.add('assistant', 'Could not reach the NOVA backend.', { error: true });
  } finally {
    busy = false;
    $('sendBtn').disabled = false;
    $('input').focus();
    refreshStatus();
  }
}

async function init() {
  const s = await settings.load();
  $('provider').value = s.provider;
  speakOn = s.speakResponses;
  $('speakToggle').setAttribute('aria-pressed', String(speakOn));
  const history = await window.nova.getHistory();
  if (Array.isArray(history) && history.length) {
    for (const m of history) chat.add(m.role, m.content, { label: m.role === 'assistant' ? providerLabel(m.provider, m.model) : '' });
  } else {
    chat.showEmpty();
  }
  refreshStatus();
  setInterval(refreshStatus, 30000);
}

$('composer').addEventListener('submit', (e) => { e.preventDefault(); send($('input').value); });
$('micBtn').addEventListener('click', () => voice.toggleListening());
$('stopSpeech').addEventListener('click', () => voice.stopSpeaking());
$('settingsBtn').addEventListener('click', () => settings.open());
$('speakToggle').addEventListener('click', async () => {
  speakOn = !speakOn;
  $('speakToggle').setAttribute('aria-pressed', String(speakOn));
  if (!speakOn) voice.stopSpeaking();
  await settings.save({ speakResponses: speakOn });
});
$('provider').addEventListener('change', async (e) => {
  try { await settings.save({ provider: e.target.value }); } catch (err) { showNotice(err.message); }
});
window.nova.onTimerDone(({ label }) => {
  chat.add('assistant', `⏰ ${label}`, { label: 'Timer' });
  if (speakOn) voice.speak(label);
});

init().catch(() => showNotice('NOVA could not load its settings.'));
