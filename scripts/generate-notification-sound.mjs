/**
 * Generates eod_click.wav — bright water-drop plop.
 *
 * Usage: node scripts/generate-notification-sound.mjs
 */
import { copyFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const PUSH_NOTIFICATION_SOUND_FILE = "eod_click.wav";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SAMPLE_RATE = 44100;
const PLOP_PITCH_SCALE = 1.36;
const TOTAL_DURATION_SEC = 0.32;

function seededNoise(index, seed = 0) {
  const x = Math.sin((index + seed) * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function noiseSample(sampleIndex, seed) {
  return seededNoise(sampleIndex, seed) * 2 - 1;
}

function splashNoise(sampleIndex, seed) {
  const n0 = noiseSample(sampleIndex, seed);
  const n1 = noiseSample(sampleIndex - 1, seed);
  const n2 = noiseSample(sampleIndex - 2, seed);
  return n0 * 0.58 + n1 * 0.3 + n2 * 0.12;
}

function plopPhase(dt, chirpDur, fStart, fEnd, fHold) {
  if (dt <= 0) return 0;
  if (dt <= chirpDur) {
    const t = dt;
    return 2 * Math.PI * (fStart * t + ((fEnd - fStart) * t * t) / (2 * chirpDur));
  }
  const chirpPhase =
    2 * Math.PI * (fStart * chirpDur + ((fEnd - fStart) * chirpDur * chirpDur) / (2 * chirpDur));
  return chirpPhase + 2 * Math.PI * fHold * (dt - chirpDur);
}

function plopEnvelope(dt, attackSec, decaySec) {
  if (dt < 0) return 0;
  const attack = 1 - Math.exp(-dt / attackSec);
  const decay = Math.exp(-dt / decaySec);
  return attack * decay;
}

function singlePlop(localTimeSec, sampleIndex, seed, gain, pitchScale) {
  if (localTimeSec < 0) return 0;

  let s = 0;

  if (localTimeSec < 0.006) {
    const env = Math.exp(-localTimeSec / 0.0014);
    s += splashNoise(sampleIndex, seed) * env * 0.22;
  }

  const plopDur = 0.18;
  if (localTimeSec <= plopDur) {
    const env = plopEnvelope(localTimeSec, 0.0006, 0.042);
    const phase = plopPhase(
      localTimeSec,
      0.014,
      520 * pitchScale,
      410 * pitchScale,
      390 * pitchScale,
    );
    const tone =
      Math.sin(phase) * 0.64 +
      Math.sin(phase * 2.01) * 0.16 +
      Math.sin(phase * 3.02) * 0.05 +
      Math.sin(phase * 0.5) * 0.04;
    s += tone * env * 0.82;
  }

  if (localTimeSec <= 0.12) {
    const env = plopEnvelope(localTimeSec, 0.0008, 0.026);
    const phase = plopPhase(
      localTimeSec,
      0.01,
      820 * pitchScale,
      660 * pitchScale,
      620 * pitchScale,
    );
    s += Math.sin(phase) * env * 0.21;
  }

  if (localTimeSec <= 0.14) {
    const env = plopEnvelope(localTimeSec, 0.001, 0.03);
    s += Math.sin(2 * Math.PI * 185 * pitchScale * localTimeSec) * env * 0.06;
  }

  return s * gain;
}

function endFade(timeSec) {
  const fadeStart = 0.22;
  if (timeSec <= fadeStart) return 1;
  const progress = (timeSec - fadeStart) / (TOTAL_DURATION_SEC - fadeStart);
  return Math.max(0, 1 - progress);
}

function waterPlop(timeSec, sampleIndex) {
  if (timeSec < 0 || timeSec > TOTAL_DURATION_SEC) return 0;

  const s = singlePlop(timeSec, sampleIndex, 2, 1.0, PLOP_PITCH_SCALE);
  return Math.max(-1, Math.min(1, s * endFade(timeSec) * 0.9));
}

function writeWav(filePath, floatSamples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = floatSamples.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (const sample of floatSamples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += 2;
  }

  writeFileSync(filePath, buffer);
}

const numSamples = Math.ceil(SAMPLE_RATE * TOTAL_DURATION_SEC);
const samples = new Float32Array(numSamples);

for (let i = 0; i < numSamples; i++) {
  samples[i] = waterPlop(i / SAMPLE_RATE, i);
}

const iosPath = join(root, "ios", "App", "App", PUSH_NOTIFICATION_SOUND_FILE);
const androidDir = join(root, "android", "app", "src", "main", "res", "raw");
const androidPath = join(androidDir, PUSH_NOTIFICATION_SOUND_FILE);

mkdirSync(dirname(iosPath), { recursive: true });
mkdirSync(androidDir, { recursive: true });
writeWav(iosPath, samples);
copyFileSync(iosPath, androidPath);

console.log(`Wrote ${iosPath}`);
console.log(`Wrote ${androidPath}`);
console.log(`Duration: ${TOTAL_DURATION_SEC}s, ${numSamples} samples`);
