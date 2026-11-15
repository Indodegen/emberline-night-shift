// Every sound is synthesised with WebAudio: oscillators and one shared noise
// buffer, no audio files, no network. The game is fully playable muted — audio is
// flavour and a hearing cue for the bots' shots, never information the player
// cannot get from the HUD.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, filterFreq, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    resume,
    setMuted(value) {
      muted = value;
    },
    shot(kind) {
      if (kind === 'longshot') {
        noise(0.22, 0.5, 900);
        tone(160, 0.16, 'square', 0.22, 55);
      } else if (kind === 'p9') {
        noise(0.1, 0.32, 1400);
        tone(220, 0.08, 'square', 0.14, 90);
      } else {
        noise(0.13, 0.4, 1100);
        tone(190, 0.1, 'square', 0.18, 70);
      }
    },
    dryFire() {
      tone(1400, 0.04, 'square', 0.08);
    },
    reload() {
      tone(420, 0.06, 'square', 0.1);
      setTimeout(() => tone(300, 0.06, 'square', 0.1), 320);
    },
    hit(kill) {
      tone(kill ? 1320 : 990, 0.07, 'sine', 0.22);
      if (kill) setTimeout(() => tone(1320, 0.09, 'sine', 0.22), 90);
    },
    hurt() {
      tone(140, 0.18, 'sawtooth', 0.2, 70);
    },
    plantBeep(done) {
      tone(done ? 1180 : 880, done ? 0.3 : 0.09, 'sine', 0.2);
    },
    explosion() {
      noise(0.9, 0.7, 320);
      tone(70, 0.7, 'sine', 0.4, 30);
    },
    roundEnd(win) {
      const notes = win ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((freq, i) => setTimeout(() => tone(freq, 0.22, 'triangle', 0.2), i * 130));
    },
    buy() {
      tone(880, 0.06, 'sine', 0.16);
      setTimeout(() => tone(1174, 0.08, 'sine', 0.16), 70);
    },
    click() {
      tone(660, 0.04, 'sine', 0.12);
    },
  };
}
