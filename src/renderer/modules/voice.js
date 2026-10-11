// Speech recognizer adapter. The browser Web Speech API is the first engine;
// to add a local engine later, pass a different `createRecognizer` to createVoice.
const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was blocked. Allow microphone access in Windows Settings > Privacy & security > Microphone.',
  'service-not-allowed': 'Speech recognition is not allowed here.',
  'no-speech': "I didn't hear anything. Try again.",
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection (or is not supported in this Electron build). You can still type.',
};

export function createWebSpeechRecognizer({ lang, onResult, onError, onStart, onEnd }) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onstart = onStart;
  rec.onend = onEnd;
  rec.onresult = (e) => onResult(e.results[0][0].transcript);
  rec.onerror = (e) => onError(ERROR_MESSAGES[e.error] || `Voice error: ${e.error}`);
  return { start: () => rec.start(), stop: () => rec.stop() };
}

export function createVoice({ getLanguage, onTranscript, onState, onError, createRecognizer = createWebSpeechRecognizer }) {
  let recognizer = null;
  let listening = false;
  const synth = window.speechSynthesis;

  function startListening() {
    stopSpeaking();
    recognizer = createRecognizer({
      lang: getLanguage(),
      onResult: onTranscript,
      onError: (message) => { listening = false; onState('error'); onError(message); },
      onStart: () => { listening = true; onState('listening'); },
      onEnd: () => { listening = false; onState('idle'); },
    });
    if (!recognizer) return onError('Speech recognition is not available here. You can still type your messages.');
    try {
      recognizer.start();
    } catch {
      onError('Could not start the microphone.');
    }
  }

  function toggleListening() {
    if (listening && recognizer) recognizer.stop();
    else startListening();
  }

  function speak(text) {
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLanguage();
    utterance.onstart = () => onState('speaking');
    utterance.onend = () => onState('idle');
    utterance.onerror = () => onState('idle');
    synth.speak(utterance);
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
    onState('idle');
  }

  return { toggleListening, speak, stopSpeaking };
}
