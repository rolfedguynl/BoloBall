let ctx: AudioContext | null = null;
let lastFall = 0;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(
  audio: AudioContext,
  opts: {
    f: number;
    d: number;
    type?: OscillatorType;
    vol?: number;
    fEnd?: number;
    delay?: number;
  },
): void {
  const t0 = audio.currentTime + (opts.delay ?? 0);
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(opts.f, t0);
  if (opts.fEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.fEnd), t0 + opts.d);
  }
  const vol = opts.vol ?? 0.05;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + opts.d);
  osc.start(t0);
  osc.stop(t0 + opts.d);
}

export function playSound(name: string): void {
  try {
    const audio = ac();
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime;

    switch (name) {
      case 'push':
        // Soft "thunk" then a rising flick — the ball being shoved in
        tone(audio, { f: 140, d: 0.07, type: 'triangle', vol: 0.07, fEnd: 90 });
        tone(audio, { f: 320, d: 0.09, type: 'square', vol: 0.045, delay: 0.04, fEnd: 480 });
        return;
      case 'fall':
        // Quiet tick each cell the marble drops through. Rate limited so a fast
        // drop cannot flood the audio graph with short-lived oscillators.
        if (t0 - lastFall < 0.05) return;
        lastFall = t0;
        tone(audio, { f: 190 + Math.random() * 40, d: 0.035, type: 'triangle', vol: 0.028 });
        return;
      case 'arrow':
        // Quick two-note swap when an arrow reverses direction
        tone(audio, { f: 520, d: 0.055, type: 'square', vol: 0.045, fEnd: 360 });
        tone(audio, { f: 360, d: 0.055, type: 'square', vol: 0.035, delay: 0.045, fEnd: 520 });
        return;
      case 'drop':
        tone(audio, { f: 220, d: 0.06, type: 'square', vol: 0.05 });
        return;
      case 'land':
        tone(audio, { f: 160, d: 0.08, type: 'triangle', vol: 0.055, fEnd: 110 });
        return;
      case 'bottom':
        tone(audio, { f: 440, d: 0.12, type: 'square', vol: 0.06 });
        tone(audio, { f: 660, d: 0.14, type: 'sine', vol: 0.04, delay: 0.06 });
        return;
      case 'bonus':
        tone(audio, { f: 660, d: 0.08, type: 'sine', vol: 0.055 });
        tone(audio, { f: 880, d: 0.1, type: 'sine', vol: 0.04, delay: 0.05 });
        return;
      case 'warp':
        tone(audio, { f: 90, d: 0.14, type: 'sawtooth', vol: 0.045, fEnd: 40 });
        return;
      case 'cascade':
        tone(audio, { f: 300, d: 0.12, type: 'triangle', vol: 0.05 });
        tone(audio, { f: 240, d: 0.14, type: 'triangle', vol: 0.04, delay: 0.08 });
        return;
      case 'level':
        tone(audio, { f: 520, d: 0.1, type: 'sine', vol: 0.05 });
        tone(audio, { f: 660, d: 0.14, type: 'sine', vol: 0.04, delay: 0.08 });
        return;
      case 'start':
        tone(audio, { f: 330, d: 0.1, type: 'square', vol: 0.05 });
        tone(audio, { f: 440, d: 0.12, type: 'square', vol: 0.04, delay: 0.08 });
        return;
      case 'end':
        tone(audio, { f: 380, d: 0.18, type: 'triangle', vol: 0.055, fEnd: 220 });
        return;
      default: {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, t0);
        gain.gain.setValueAtTime(0.05, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        osc.start(t0);
        osc.stop(t0 + 0.05);
      }
    }
  } catch {
    /* ignore audio errors */
  }
}
