/**
 * Clean dialogue text for natural Japanese speech synthesis.
 * Trims whitespace and strips outer Japanese quotation marks.
 * @param {string} rawText
 * @returns {string}
 */
export function cleanSpeechText(rawText) {
  let text = (rawText || '').trim();
  if (!text) return '';

  const pairs = [
    ['「', '」'],
    ['『', '』'],
  ];
  for (const [open, close] of pairs) {
    if (text.startsWith(open) && text.endsWith(close) && text.length >= 2) {
      text = text.slice(1, -1).trim();
      break;
    }
  }
  return text;
}

/**
 * Return senior-friendly speech rate and pitch profile based on speaker name.
 * @param {string} speaker
 * @returns {{ rate: number, pitch: number }}
 */
export function getSpeakerVoiceProfile(speaker) {
  const name = (speaker || '').trim();
  if (name.includes('娘') || name.includes('家族')) {
    return { rate: 0.94, pitch: 1.12 };
  }
  if (name.includes('あなた')) {
    return { rate: 0.88, pitch: 0.98 };
  }
  return { rate: 0.9, pitch: 1.0 };
}

/**
 * Browser Web Speech API wrapper for reading dialogue scenes aloud.
 */
export class SpeechPlayer {
  constructor() {
    this.enabled = true;
    this.preferredVoice = null;

    if (this.isSupported()) {
      this._refreshVoices();
      const synth = window.speechSynthesis;
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', () => this._refreshVoices());
      } else {
        synth.onvoiceschanged = () => this._refreshVoices();
      }
    }
  }

  /**
   * Check whether Web Speech API synthesis is available in the current environment.
   * @returns {boolean}
   */
  isSupported() {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  /**
   * Select the best available Japanese voice from browser voices.
   */
  _refreshVoices() {
    if (!this.isSupported()) return;
    const voices = window.speechSynthesis.getVoices?.() || [];
    if (!voices.length) return;

    const jaVoices = voices.filter(
      (v) => typeof v.lang === 'string' && v.lang.toLowerCase().startsWith('ja')
    );
    if (!jaVoices.length) return;

    const exactJaJp = jaVoices.filter((v) => v.lang.toLowerCase() === 'ja-jp');
    const pool = exactJaJp.length ? exactJaJp : jaVoices;

    this.preferredVoice =
      pool.find((v) => v.localService && !v.default) ||
      pool.find((v) => v.localService) ||
      pool.find((v) => v.default) ||
      pool[0];
  }

  /**
   * Enable or disable automatic dialogue speech.
   * @param {boolean} flag
   */
  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.enabled) {
      this.stop();
    }
  }

  /**
   * Immediately cancel any active or queued speech synthesis.
   */
  stop() {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
  }

  /**
   * Speak the given text immediately, canceling any prior utterance first.
   * @param {string} text
   * @param {{ speaker?: string }} [options]
   * @returns {boolean}
   */
  speak(text, { speaker = '' } = {}) {
    if (!this.isSupported()) return false;

    this.stop();

    const cleaned = cleanSpeechText(text);
    if (!cleaned) return false;

    if (!this.preferredVoice) {
      this._refreshVoices();
    }

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = 'ja-JP';
    if (this.preferredVoice) {
      utterance.voice = this.preferredVoice;
    }

    const profile = getSpeakerVoiceProfile(speaker);
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;

    window.speechSynthesis.speak(utterance);
    return true;
  }

  /**
   * Cancel any active speech and automatically speak if enabled and scene is a dialogue.
   * @param {Record<string, string>|null|undefined} scene
   * @returns {boolean}
   */
  speakDialogueIfEnabled(scene) {
    this.stop();
    if (!this.enabled || !scene) return false;
    if ((scene.scene_type || '').trim() !== 'dialogue') return false;
    return this.speak(scene.text, { speaker: (scene.speaker || '').trim() });
  }
}
