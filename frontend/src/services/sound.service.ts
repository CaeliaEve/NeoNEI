// UI sound service using Web Audio API
class SoundService {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.3;

  constructor() {
    // Initialize AudioContext on user interaction
    if (typeof window !== 'undefined') {
      this.initAudioContext();
    }
  }

  private initAudioContext() {
    try {
      const audioGlobal = globalThis as typeof globalThis & {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = audioGlobal.AudioContext || audioGlobal.webkitAudioContext;
      this.audioContext = AudioContextCtor ? new AudioContextCtor() : null;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  // Play a short, woodier Minecraft-like button click.
  playClick(): void {
    if (!this.enabled || !this.audioContext) return;

    try {
      // Resume context if suspended (required by browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 1.1, now);
      masterGain.connect(ctx.destination);

      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(420, now);
      body.frequency.exponentialRampToValueAtTime(280, now + 0.038);
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(this.volume * 0.24, now + 0.003);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      body.connect(bodyGain);
      bodyGain.connect(masterGain);
      body.start(now);
      body.stop(now + 0.06);

      const knock = ctx.createOscillator();
      const knockGain = ctx.createGain();
      knock.type = 'triangle';
      knock.frequency.setValueAtTime(760, now + 0.001);
      knock.frequency.exponentialRampToValueAtTime(420, now + 0.022);
      knockGain.gain.setValueAtTime(0.0001, now);
      knockGain.gain.exponentialRampToValueAtTime(this.volume * 0.16, now + 0.002);
      knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
      knock.connect(knockGain);
      knockGain.connect(masterGain);
      knock.start(now);
      knock.stop(now + 0.03);

      // Small noise transient for the tactile wooden attack.
      const noiseDuration = 0.02;
      const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * noiseDuration)), ctx.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) {
        const falloff = 1 - i / channel.length;
        channel[i] = (Math.random() * 2 - 1) * falloff * 0.18;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(900, now);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(2400, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.exponentialRampToValueAtTime(this.volume * 0.07, now + 0.0015);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDuration);

      noiseSource.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(noiseGain);
      noiseGain.connect(masterGain);
      noiseSource.start(now);
      noiseSource.stop(now + noiseDuration + 0.01);
    } catch (e) {
      console.warn('Error playing click sound:', e);
    }
  }

  // Play Minecraft-style pop sound (for item pickup)
  playPop(): void {
    if (!this.enabled || !this.audioContext) return;

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Pop sound: higher pitch, quick attack
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, now);
      oscillator.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

      gainNode.gain.setValueAtTime(this.volume * 0.8, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.1);
    } catch (e) {
      console.warn('Error playing pop sound:', e);
    }
  }

  // Play error/buzz sound
  playError(): void {
    if (!this.enabled || !this.audioContext) return;

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Low buzz for error
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, now);
      oscillator.frequency.linearRampToValueAtTime(100, now + 0.2);

      gainNode.gain.setValueAtTime(this.volume * 0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch (e) {
      console.warn('Error playing error sound:', e);
    }
  }

  // Enable/disable sounds
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // Set volume (0.0 to 1.0)
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Check if sounds are enabled
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const soundService = new SoundService();

// Export composable for Vue components
export const useSound = () => {
  return {
    playClick: () => soundService.playClick(),
    playPop: () => soundService.playPop(),
    playError: () => soundService.playError(),
    setEnabled: (enabled: boolean) => soundService.setEnabled(enabled),
    setVolume: (volume: number) => soundService.setVolume(volume),
    isEnabled: () => soundService.isEnabled()
  };
};
