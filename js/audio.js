// Tiny synth so the game has sound without any audio files.
import { G } from './state.js';

let ctx = null, master = null, noiseBuf = null;
export let muted = false;
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : G.settings.volume; return muted; }
export function setVolume(v) { G.settings.volume = v; if (master && !muted) master.gain.value = v; }

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = G.settings.volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch { return false; }
}
addEventListener('pointerdown', ensure, { once: false });

function tone(f, dur, type = 'square', vol = .2, slide = 0, delay = 0) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .3, freq = 1200, type = 'bandpass', delay = 0) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
}

export const sfx = {
  swing: () => noise(.08, .12, 2600, 'highpass'),
  hit: () => { noise(.09, .35, 900); tone(140, .12, 'sine', .3, .5); },
  hurt: () => { tone(220, .18, 'sawtooth', .12, .55); noise(.1, .2, 500); },
  place: () => { noise(.05, .25, 700); tone(260, .05, 'triangle', .1); },
  break: () => { noise(.16, .35, 450); noise(.08, .2, 1600, 'bandpass', .03); },
  mineTick: () => noise(.04, .08, 1100),
  pickup: () => { tone(880, .06, 'square', .06); tone(1320, .07, 'square', .05, 0, .05); },
  buy: () => { tone(660, .07, 'square', .08); tone(990, .1, 'square', .08, 0, .07); },
  deny: () => tone(150, .15, 'square', .1),
  bow: () => { tone(420, .12, 'triangle', .14, .45); noise(.06, .1, 3000, 'highpass'); },
  boom: () => { noise(.7, .6, 220, 'lowpass'); tone(70, .5, 'sine', .4, .4); },
  bed: () => { tone(520, .2, 'sawtooth', .14, .5); tone(330, .45, 'sawtooth', .14, .4, .18); noise(.4, .25, 300, 'lowpass', .1); },
  kill: () => { tone(988, .08, 'square', .09); tone(1480, .16, 'square', .08, 0, .08); },
  death: () => { tone(300, .5, 'sawtooth', .14, .3); },
  click: () => tone(720, .03, 'square', .05),
  eat: () => { noise(.06, .2, 900); noise(.06, .2, 900, 'bandpass', .12); tone(600, .15, 'sine', .08, 1.5, .25); },
  alarm: () => { for (let i = 0; i < 3; i++) { tone(880, .12, 'square', .1, 1, i * .25); tone(660, .12, 'square', .1, 1, i * .25 + .12); } },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, .3, 'square', .09, 1, i * .14)); },
  pearl: () => tone(300, .3, 'sine', .15, 3),
};
