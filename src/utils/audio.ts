/**
 * Zero-latency Audio Engine for SMUTA PAY
 * Uses Web Audio API to generate feedback tones offline.
 */

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

/**
 * Plays a premium business chime (Dual-tone)
 */
export const playChime = () => {
  try {
    const ctx = initAudio();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    
    // First Note (Root)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(440, now + 0.1);
    
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second Note (Higher Harmony) - slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.05); // E6
    
    gain2.gain.setValueAtTime(0.05, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.start(now + 0.05);
    osc2.stop(now + 0.4);

  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
};

/**
 * Plays a sharp confirm beep
 */
export const playBeep = () => {
  try {
    const ctx = initAudio();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
};
