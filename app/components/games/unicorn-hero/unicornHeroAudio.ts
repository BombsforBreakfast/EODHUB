import type { RainbowCowboyPickupKind } from "../rainbow-cowboy/rainbowCowboyTypes";

export type HealthPickupKind = Extract<
  RainbowCowboyPickupKind,
  "range_beer" | "white_monster" | "zyn_tin"
>;

export type UnicornHeroAudioEvent =
  | { type: "jump" }
  | { type: "tongue" }
  | { type: "drone_eat" }
  | { type: "explosion" }
  | { type: "rainbow_pickup" }
  | { type: "rainbow_blast" }
  | { type: "unicorn_treat" }
  | { type: "trash_balloon_gas" }
  | { type: "health_pickup"; pickup: HealthPickupKind }
  | { type: "damage" }
  | { type: "death" }
  | { type: "level_complete" };

export interface UnicornHeroAudioPrefs {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
}

const DEFAULT_PREFS: UnicornHeroAudioPrefs = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.3,
  sfxVolume: 0.55,
};

const STORAGE = {
  musicEnabled: "unicornHero_musicEnabled",
  sfxEnabled: "unicornHero_sfxEnabled",
  musicVolume: "unicornHero_musicVolume",
  sfxVolume: "unicornHero_sfxVolume",
} as const;

export function loadUnicornHeroAudioPrefs(): UnicornHeroAudioPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const musicEnabled = localStorage.getItem(STORAGE.musicEnabled);
    const sfxEnabled = localStorage.getItem(STORAGE.sfxEnabled);
    const musicVolume = localStorage.getItem(STORAGE.musicVolume);
    const sfxVolume = localStorage.getItem(STORAGE.sfxVolume);
    return {
      musicEnabled: musicEnabled == null ? DEFAULT_PREFS.musicEnabled : musicEnabled === "true",
      sfxEnabled: sfxEnabled == null ? DEFAULT_PREFS.sfxEnabled : sfxEnabled === "true",
      musicVolume: musicVolume == null ? DEFAULT_PREFS.musicVolume : clamp01(parseFloat(musicVolume)),
      sfxVolume: sfxVolume == null ? DEFAULT_PREFS.sfxVolume : clamp01(parseFloat(sfxVolume)),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUnicornHeroAudioPrefs(prefs: UnicornHeroAudioPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE.musicEnabled, String(prefs.musicEnabled));
    localStorage.setItem(STORAGE.sfxEnabled, String(prefs.sfxEnabled));
    localStorage.setItem(STORAGE.musicVolume, String(prefs.musicVolume));
    localStorage.setItem(STORAGE.sfxVolume, String(prefs.sfxVolume));
  } catch {
    // ignore storage errors
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** Original bouncy loop — C major pentatonic, SNES-ish square lead + soft bass. */
const MELODY_HZ = [
  262, 0, 294, 262, 330, 294, 262, 220,
  262, 294, 330, 392, 330, 294, 262, 0,
  330, 392, 440, 392, 330, 294, 262, 294,
  330, 330, 294, 262, 220, 262, 0, 0,
] as const;

const BASS_HZ = [
  131, 0, 131, 0, 147, 0, 131, 0,
  165, 0, 147, 0, 131, 0, 110, 0,
  165, 0, 165, 0, 147, 0, 131, 0,
  110, 0, 131, 0, 165, 0, 131, 0,
] as const;

const STEP_MS = 118;

export interface UnicornHeroAudio {
  init(): Promise<void>;
  destroy(): void;
  startMusic(): void;
  stopMusic(): void;
  pauseMusic(): void;
  resumeMusic(): void;
  setMusicEnabled(enabled: boolean): void;
  setSfxEnabled(enabled: boolean): void;
  setMusicVolume(value: number): void;
  setSfxVolume(value: number): void;
  setRampageMode(active: boolean): void;
  applyPrefs(prefs: UnicornHeroAudioPrefs): void;
  getPrefs(): UnicornHeroAudioPrefs;
  playJump(): void;
  playTongue(): void;
  playDroneEat(): void;
  playExplosion(): void;
  playRainbowPickup(): void;
  playRainbowBlast(): void;
  playUnicornTreat(): void;
  playTrashBalloonGas(): void;
  playHealthPickup(type: HealthPickupKind): void;
  playDamage(): void;
  playDeath(): void;
  playLevelComplete(): void;
  handleEvent(event: UnicornHeroAudioEvent): void;
}

export function createUnicornHeroAudio(initialPrefs = loadUnicornHeroAudioPrefs()): UnicornHeroAudio {
  let ctx: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let musicStep = 0;
  let musicRunning = false;
  let musicPaused = false;
  let rampageMode = false;
  let initialized = false;

  let prefs: UnicornHeroAudioPrefs = { ...initialPrefs };

  const throttleUntil: Record<string, number> = {};
  let deathPlayed = false;
  let levelCompletePlayed = false;

  function nowMs() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  function canPlay(key: string, ms: number): boolean {
    const t = nowMs();
    if ((throttleUntil[key] ?? 0) > t) return false;
    throttleUntil[key] = t + ms;
    return true;
  }

  function ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
      applyGainLevels();
    }
    return ctx;
  }

  function applyGainLevels() {
    if (!musicGain || !sfxGain) return;
    musicGain.gain.value = prefs.musicEnabled ? prefs.musicVolume : 0;
    sfxGain.gain.value = prefs.sfxEnabled ? prefs.sfxVolume : 0;
  }

  async function resumeCtx() {
    const c = ensureCtx();
    if (c && c.state === "suspended") await c.resume();
  }

  function playOsc(
    freq: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    dest: GainNode,
    attack = 0.008,
    release = 0.06,
    detune = 0,
  ) {
    if (freq <= 0 || volume <= 0) return;
    const c = ensureCtx();
    if (!c || !dest) return;

    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(g);
    g.connect(dest);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec + release);

    osc.start(t0);
    osc.stop(t0 + durationSec + release + 0.02);
  }

  function playNoise(durationSec: number, volume: number, filterHz = 800, filterType: BiquadFilterType = "bandpass") {
    const c = ensureCtx();
    if (!c || !sfxGain || volume <= 0) return;
    const bufferSize = Math.floor(c.sampleRate * durationSec);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterHz;
    const g = c.createGain();
    src.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);

    const t0 = c.currentTime;
    g.gain.setValueAtTime(volume, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
    src.start(t0);
    src.stop(t0 + durationSec + 0.02);
  }

  /** Cartoon boom — lowpass noise body + descending sub sweep + short crack. */
  function playExplosionBurst(volume: number) {
    const c = ensureCtx();
    if (!c || !sfxGain || volume <= 0) return;
    const t0 = c.currentTime;

    const bodyDur = 0.34;
    const bodySize = Math.floor(c.sampleRate * bodyDur);
    const bodyBuf = c.createBuffer(1, bodySize, c.sampleRate);
    const bodyData = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodySize; i++) bodyData[i] = Math.random() * 2 - 1;

    const bodySrc = c.createBufferSource();
    bodySrc.buffer = bodyBuf;
    const bodyLp = c.createBiquadFilter();
    bodyLp.type = "lowpass";
    bodyLp.frequency.setValueAtTime(1100, t0);
    bodyLp.frequency.exponentialRampToValueAtTime(90, t0 + bodyDur * 0.85);
    bodyLp.Q.value = 0.7;
    const bodyGain = c.createGain();
    bodyGain.gain.setValueAtTime(volume * 0.95, t0);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + bodyDur);
    bodySrc.connect(bodyLp);
    bodyLp.connect(bodyGain);
    bodyGain.connect(sfxGain);
    bodySrc.start(t0);
    bodySrc.stop(t0 + bodyDur + 0.02);

    const boomOsc = c.createOscillator();
    boomOsc.type = "sawtooth";
    boomOsc.frequency.setValueAtTime(165, t0);
    boomOsc.frequency.exponentialRampToValueAtTime(32, t0 + 0.24);
    const boomLp = c.createBiquadFilter();
    boomLp.type = "lowpass";
    boomLp.frequency.value = 320;
    const boomGain = c.createGain();
    boomGain.gain.setValueAtTime(0.0001, t0);
    boomGain.gain.exponentialRampToValueAtTime(volume * 0.55, t0 + 0.006);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    boomOsc.connect(boomLp);
    boomLp.connect(boomGain);
    boomGain.connect(sfxGain);
    boomOsc.start(t0);
    boomOsc.stop(t0 + 0.28);

    const crackDur = 0.055;
    const crackSize = Math.floor(c.sampleRate * crackDur);
    const crackBuf = c.createBuffer(1, crackSize, c.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackSize; i++) crackData[i] = Math.random() * 2 - 1;

    const crackSrc = c.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackHp = c.createBiquadFilter();
    crackHp.type = "highpass";
    crackHp.frequency.value = 700;
    const crackGain = c.createGain();
    crackGain.gain.setValueAtTime(volume * 0.35, t0);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, t0 + crackDur);
    crackSrc.connect(crackHp);
    crackHp.connect(crackGain);
    crackGain.connect(sfxGain);
    crackSrc.start(t0);
    crackSrc.stop(t0 + crackDur + 0.01);
  }

  function playSfx(fn: () => void) {
    if (!prefs.sfxEnabled) return;
    fn();
  }

  function tickMusic() {
    if (!musicRunning || musicPaused || !prefs.musicEnabled || !musicGain) return;

    const leadVol = rampageMode ? 0.11 : 0.085;
    const bassVol = rampageMode ? 0.09 : 0.07;

    const idx = musicStep % MELODY_HZ.length;
    const mel = MELODY_HZ[idx];
    const bass = BASS_HZ[idx];

    if (mel > 0) playOsc(mel, 0.09, "square", leadVol, musicGain, 0.004, 0.05);
    if (bass > 0 && idx % 2 === 0) playOsc(bass, 0.11, "triangle", bassVol, musicGain, 0.01, 0.08);

    musicStep += 1;
  }

  function startMusicLoop() {
    if (musicTimer) return;
    musicRunning = true;
    musicPaused = false;
    const intervalMs = rampageMode ? Math.round(STEP_MS / 1.28) : STEP_MS;
    musicTimer = setInterval(tickMusic, intervalMs);
  }

  function restartMusicTimer() {
    if (!musicTimer) return;
    clearInterval(musicTimer);
    musicTimer = null;
    if (musicRunning && !musicPaused) startMusicLoop();
  }

  const api: UnicornHeroAudio = {
    async init() {
      if (initialized) {
        await resumeCtx();
        return;
      }
      await resumeCtx();
      initialized = true;
    },

    destroy() {
      musicRunning = false;
      musicPaused = false;
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
      if (ctx) {
        void ctx.close();
        ctx = null;
        musicGain = null;
        sfxGain = null;
      }
      initialized = false;
      deathPlayed = false;
      levelCompletePlayed = false;
    },

    startMusic() {
      if (!prefs.musicEnabled) return;
      musicRunning = true;
      musicPaused = false;
      startMusicLoop();
    },

    stopMusic() {
      musicRunning = false;
      musicPaused = false;
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },

    pauseMusic() {
      musicPaused = true;
    },

    resumeMusic() {
      if (!musicRunning || !prefs.musicEnabled) return;
      musicPaused = false;
      if (!musicTimer) startMusicLoop();
    },

    setMusicEnabled(enabled: boolean) {
      prefs.musicEnabled = enabled;
      saveUnicornHeroAudioPrefs(prefs);
      applyGainLevels();
      if (!enabled) api.stopMusic();
      else if (initialized && musicRunning) api.startMusic();
    },

    setSfxEnabled(enabled: boolean) {
      prefs.sfxEnabled = enabled;
      saveUnicornHeroAudioPrefs(prefs);
      applyGainLevels();
    },

    setMusicVolume(value: number) {
      prefs.musicVolume = clamp01(value);
      saveUnicornHeroAudioPrefs(prefs);
      applyGainLevels();
    },

    setSfxVolume(value: number) {
      prefs.sfxVolume = clamp01(value);
      saveUnicornHeroAudioPrefs(prefs);
      applyGainLevels();
    },

    setRampageMode(active: boolean) {
      if (rampageMode === active) return;
      rampageMode = active;
      restartMusicTimer();
    },

    applyPrefs(next: UnicornHeroAudioPrefs) {
      prefs = { ...next };
      saveUnicornHeroAudioPrefs(prefs);
      applyGainLevels();
    },

    getPrefs() {
      return { ...prefs };
    },

    playJump() {
      playSfx(() => {
        if (!canPlay("jump", 180) || !sfxGain) return;
        playOsc(180, 0.07, "sine", 0.22, sfxGain, 0.005, 0.08);
        playOsc(340, 0.09, "triangle", 0.14, sfxGain, 0.005, 0.1, 80);
      });
    },

    playTongue() {
      playSfx(() => {
        if (!canPlay("tongue", 280) || !sfxGain) return;
        playOsc(520, 0.04, "sawtooth", 0.08, sfxGain, 0.002, 0.03);
        playOsc(280, 0.06, "triangle", 0.12, sfxGain, 0.003, 0.04, -120);
      });
    },

    playDroneEat() {
      playSfx(() => {
        if (!canPlay("droneEat", 120) || !sfxGain) return;
        playOsc(160, 0.05, "square", 0.1, sfxGain, 0.003, 0.04);
        playOsc(90, 0.08, "triangle", 0.16, sfxGain, 0.005, 0.06);
        playOsc(440, 0.06, "sine", 0.08, sfxGain, 0.01, 0.05);
      });
    },

    playExplosion() {
      playSfx(() => {
        if (!canPlay("explosion", 90) || !sfxGain) return;
        playExplosionBurst(0.32);
      });
    },

    playRainbowPickup() {
      playSfx(() => {
        if (!canPlay("rainbowPickup", 100) || !sfxGain) return;
        [523, 659, 784].forEach((f, i) => {
          setTimeout(() => playOsc(f, 0.07, "sine", 0.12, sfxGain!, 0.003, 0.05), i * 55);
        });
      });
    },

    playRainbowBlast() {
      playSfx(() => {
        if (!canPlay("rainbowBlast", 400) || !sfxGain) return;
        playOsc(95, 0.14, "sawtooth", 0.14, sfxGain, 0.01, 0.08, -200);
        playOsc(70, 0.18, "triangle", 0.1, sfxGain, 0.01, 0.1);
        setTimeout(() => {
          playNoise(0.08, 0.12, 1200);
          [392, 494, 587, 698].forEach((f, i) => {
            setTimeout(() => playOsc(f, 0.08, "square", 0.09, sfxGain!, 0.004, 0.06), i * 40);
          });
        }, 120);
      });
    },

    playUnicornTreat() {
      playSfx(() => {
        if (!canPlay("unicornTreat", 500) || !sfxGain) return;
        [262, 330, 392, 523, 659, 784].forEach((f, i) => {
          setTimeout(() => playOsc(f, 0.1, "square", 0.11, sfxGain!, 0.004, 0.07), i * 65);
        });
      });
    },

    playTrashBalloonGas() {
      playSfx(() => {
        if (!canPlay("gas", 350) || !sfxGain) return;
        playOsc(120, 0.2, "sawtooth", 0.1, sfxGain, 0.02, 0.12, -300);
        playNoise(0.12, 0.08, 400);
        setTimeout(() => playOsc(90, 0.15, "triangle", 0.08, sfxGain!, 0.01, 0.1), 100);
      });
    },

    playHealthPickup(type: HealthPickupKind) {
      playSfx(() => {
        if (!canPlay(`health-${type}`, 120) || !sfxGain) return;
        if (type === "range_beer") {
          playOsc(180, 0.06, "triangle", 0.12, sfxGain, 0.005, 0.05);
          setTimeout(() => playOsc(220, 0.05, "triangle", 0.1, sfxGain!, 0.005, 0.04), 70);
        } else if (type === "white_monster") {
          playNoise(0.03, 0.06, 2000);
          playOsc(660, 0.08, "square", 0.1, sfxGain, 0.002, 0.05);
          playOsc(880, 0.06, "sine", 0.08, sfxGain, 0.003, 0.04);
        } else {
          playOsc(920, 0.03, "square", 0.08, sfxGain, 0.001, 0.02);
          playOsc(740, 0.04, "triangle", 0.1, sfxGain, 0.002, 0.03);
        }
      });
    },

    playDamage() {
      playSfx(() => {
        if (!canPlay("damage", 350) || !sfxGain) return;
        playOsc(220, 0.07, "square", 0.12, sfxGain, 0.002, 0.05);
        playOsc(160, 0.09, "sawtooth", 0.08, sfxGain, 0.002, 0.06);
      });
    },

    playDeath() {
      if (deathPlayed) return;
      deathPlayed = true;
      playSfx(() => {
        if (!sfxGain) return;
        [330, 294, 262, 220, 196].forEach((f, i) => {
          setTimeout(() => playOsc(f, 0.14, "triangle", 0.12, sfxGain!, 0.005, 0.08), i * 110);
        });
      });
      api.stopMusic();
    },

    playLevelComplete() {
      if (levelCompletePlayed) return;
      levelCompletePlayed = true;
      playSfx(() => {
        if (!sfxGain) return;
        [392, 494, 587, 784, 659, 784].forEach((f, i) => {
          setTimeout(() => playOsc(f, 0.09, "square", 0.1, sfxGain!, 0.004, 0.06), i * 90);
        });
      });
      api.stopMusic();
    },

    handleEvent(event: UnicornHeroAudioEvent) {
      switch (event.type) {
        case "jump":
          api.playJump();
          break;
        case "tongue":
          api.playTongue();
          break;
        case "drone_eat":
          api.playDroneEat();
          break;
        case "explosion":
          api.playExplosion();
          break;
        case "rainbow_pickup":
          api.playRainbowPickup();
          break;
        case "rainbow_blast":
          api.playRainbowBlast();
          break;
        case "unicorn_treat":
          api.playUnicornTreat();
          break;
        case "trash_balloon_gas":
          api.playTrashBalloonGas();
          break;
        case "health_pickup":
          api.playHealthPickup(event.pickup);
          break;
        case "damage":
          api.playDamage();
          break;
        case "death":
          api.playDeath();
          break;
        case "level_complete":
          api.playLevelComplete();
          break;
      }
    },
  };

  applyGainLevels();
  return api;
}
