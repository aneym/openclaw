import { useNotificationStore } from "../stores/notification-store";

export const BUILT_IN_SOUNDS = [
  { id: "chime", name: "Chime" },
  { id: "pop", name: "Pop" },
  { id: "ping", name: "Ping" },
] as const;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Sound config: waveform, frequency (Hz), duration (seconds) */
const SOUND_CONFIG: Record<string, { type: OscillatorType; freq: number; dur: number }> = {
  chime: { type: "sine", freq: 880, dur: 0.15 },
  pop: { type: "triangle", freq: 440, dur: 0.08 },
  ping: { type: "sine", freq: 1200, dur: 0.1 },
};

const DEFAULT_SOUND = SOUND_CONFIG.chime;

/**
 * Synthesize and play a notification sound using Web Audio API.
 */
function playSynthSound(soundId: string, volume: number) {
  const { type, freq, dur } = SOUND_CONFIG[soundId] ?? DEFAULT_SOUND;
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.connect(gain);
  osc.type = type;
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.start(now);
  osc.stop(now + dur);
}

/**
 * Play the configured notification sound.
 * Reads preferences from the notification store.
 */
export function playNotificationSound() {
  const { soundEnabled, soundId, soundVolume } = useNotificationStore.getState();
  if (!soundEnabled) return;
  playSynthSound(soundId, soundVolume);
}

/**
 * Preview a specific sound at a specific volume.
 * Used by the settings UI.
 */
export function previewSound(soundId: string, volume: number) {
  playSynthSound(soundId, volume);
}
