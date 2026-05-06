async function playFallbackBeep() {
  const audioContext = new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.28, audioContext.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.65);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.7);
}

async function playSound() {
  try {
    const audio = new Audio(chrome.runtime.getURL("assets/lofi.mp3"));
    audio.volume = 0.9;
    await audio.play();
  } catch {
    await playFallbackBeep();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "play-sound") {
    playSound();
  }
});
