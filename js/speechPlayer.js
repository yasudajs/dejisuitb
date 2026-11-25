/**
 * Clean scene text for natural Japanese speech synthesis.
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
  if (name.includes('案内')) {
    return { rate: 0.9, pitch: 1.04 };
  }
  return { rate: 0.9, pitch: 1.0 };
}

/**
 * Browser Web Speech API wrapper for reading story scenes aloud.
 */
export class SpeechPlayer {
  constructor() {
    this.enabled = true;
    this.preferredVoice = null;
    this._pendingTimer = null;
    this._currentUtterance = null;

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
      pool.find((v) => v.default) ||
      pool.find((v) => v.localService) ||
      pool[0];
  }

  /**
   * Enable or disable automatic scene speech.
   * @param {boolean} flag
   */
  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.enabled) {
      this.stop();
    }
  }

  /**
   * Immediately cancel any pending timer or active/queued speech synthesis.
   */
  stop() {
    if (this._pendingTimer !== null) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    this._currentUtterance = null;

    if (!this.isSupported()) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      synth.cancel();
    }
  }

  /**
   * Speak the given text, safely handling Chrome/Edge/Safari cancel-then-speak behavior.
   * @param {string} text
   * @param {{ speaker?: string }} [options]
   * @returns {boolean}
   */
  speak(text, { speaker = '' } = {}) {
    if (!this.isSupported()) return false;

    const synth = window.speechSynthesis;
    const wasBusy = Boolean(synth.speaking || synth.pending);
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

    const clearCurrent = () => {
      if (this._currentUtterance === utterance) {
        this._currentUtterance = null;
      }
    };
    utterance.onend = clearCurrent;
    utterance.onerror = clearCurrent;

    const startSpeak = () => {
      this._currentUtterance = utterance;
      if (synth.paused && typeof synth.resume === 'function') {
        synth.resume();
      }
      synth.speak(utterance);
    };

    if (wasBusy) {
      this._pendingTimer = setTimeout(() => {
        this._pendingTimer = null;
        startSpeak();
      }, 60);
    } else {
      startSpeak();
    }

    return true;
  }

  /**
   * Automatically speak the scene text if speech is enabled and text is present.
   * @param {Record<string, string>|null|undefined} scene
   * @returns {boolean}
   */
  speakSceneIfEnabled(scene) {
    if (!this.enabled || !scene || !(scene.text || '').trim()) {
      this.stop();
      return false;
    }
    return this.speak(scene.text, { speaker: (scene.speaker || '').trim() });
  }
}
