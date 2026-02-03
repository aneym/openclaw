let audioContext: AudioContext | null = null;

/**
 * Plays a subtle notification beep using Web Audio API.
 * Creates a short, pleasant sine wave tone.
 */
export function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Subtle, pleasant tone
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note

    // Short fade in/out for smooth sound
    const now = audioContext.currentTime;
    const duration = 0.15; // 150ms - short and subtle

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02); // Quick fade in
    gainNode.gain.linearRampToValueAtTime(0, now + duration); // Fade out

    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // Ignore audio errors (unsupported browser, policy restrictions, etc.)
  }
}

/**
 * Determines if the notification sound should play based on visibility.
 * Only plays when user isn't actively watching the chat.
 */
export function shouldPlaySound(tabFocused: boolean, chatVisible: boolean): boolean {
  return !(tabFocused && chatVisible);
}
