// Sound, synthesized: no audio files, no network. Every sound is a short
// oscillator or filtered-noise burst through one master gain, so the whole
// soundscape is a few dozen lines and loads nothing. The context is created on
// the first user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t, Math.random() * 0.3, duration + 0.05);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (!ensure()) return;
      if (kind === 'marksman') { noise(0.28, 900, 0.9); tone(70, 0.22, 0.5, 'sine', 40); }
      else if (kind === 'smg') { noise(0.09, 1800, 0.5); tone(140, 0.07, 0.25, 'square', 70); }
      else if (kind === 'rifle') { noise(0.14, 1400, 0.7); tone(110, 0.1, 0.35, 'sine', 55); }
      else { noise(0.1, 2200, 0.55); tone(180, 0.06, 0.2, 'square', 90); }
    },
    // A distant shot, quieter and duller, so firefights carry across the map.
    distantShot() { if (ensure()) noise(0.12, 500, 0.12); },
    dryFire() { if (ensure()) tone(900, 0.05, 0.15, 'square'); },
    reload() {
      if (!ensure()) return;
      tone(500, 0.05, 0.2, 'square', 300);
      tone(700, 0.05, 0.2, 'square', 400, 0.25);
    },
    hit() { if (ensure()) tone(1200, 0.06, 0.25, 'sine'); },
    kill() { if (ensure()) { tone(1200, 0.06, 0.25, 'sine'); tone(1600, 0.1, 0.25, 'sine', null, 0.07); } },
    hurt() { if (ensure()) tone(180, 0.12, 0.3, 'sawtooth', 90); },
    plant() { if (ensure()) { tone(440, 0.1, 0.3, 'square'); tone(660, 0.1, 0.3, 'square', null, 0.15); } },
    beep() { if (ensure()) tone(880, 0.08, 0.25, 'square'); },
    explosion() {
      if (!ensure()) return;
      noise(1.2, 300, 1.0);
      tone(55, 1.0, 0.8, 'sine', 28);
    },
    roundWin() {
      if (!ensure()) return;
      tone(523, 0.12, 0.25, 'sine');
      tone(659, 0.12, 0.25, 'sine', null, 0.12);
      tone(784, 0.2, 0.25, 'sine', null, 0.24);
    },
    roundLose() {
      if (!ensure()) return;
      tone(392, 0.15, 0.25, 'sine');
      tone(311, 0.25, 0.25, 'sine', null, 0.15);
    },
    buy() { if (ensure()) tone(990, 0.08, 0.2, 'sine'); },
    denied() { if (ensure()) tone(220, 0.12, 0.25, 'square', 160); },
  };
}
