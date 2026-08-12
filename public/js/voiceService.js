export const VoiceService = (() => {
  const synth = window.speechSynthesis;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function speak(text) {
    if (!synth) return false;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1; utter.pitch = 1; utter.lang = 'en-US';
    synth.speak(utter); return true;
  }

  function listen(onResult, onEnd) {
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = e => { const t = e.results[0][0].transcript; onResult && onResult(t); };
    if (onEnd) rec.onend = onEnd; rec.start();
    return rec;
  }

  return { speak, listen };
})();



