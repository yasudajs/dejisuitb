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
 * Map a speaker label from scenario CSV to a normalized role key.
 * @param {string} speaker
 * @returns {'narrator'|'you'|'daughter'|'guide'}
 */
export function getSpeakerRole(speaker) {
  const name = (speaker || '').trim();
  if (name.includes('娘') || name.includes('家族')) {
    return 'daughter';
  }
  if (name.includes('あなた') || name.includes('私')) {
    return 'you';
  }
  if (name.includes('案内')) {
    return 'guide';
  }
  return 'narrator';
}

const ROLE_VOICE_KEYWORDS = {
  narrator: ['keita', 'ichiro', 'otoya', 'hattori', 'jad', 'male', '男性', 'google 日本語'],
  you: ['haruka', 'kyoko', 'sayaka', 'jab', 'nanami', 'google 日本語'],
  daughter: ['ayumi', 'mayu', 'shiori', 'nanami', 'o-ren', 'oren', 'jac', 'sayaka', 'google 日本語'],
};

const VOICE_PROFILES_DISTINCT = {
  narrator: { rate: 0.9, pitch: 0.96 },
  you: { rate: 0.87, pitch: 0.94 },
  daughter: { rate: 1.05, pitch: 1.26 },
  guide: { rate: 0.92, pitch: 1.04 },
};

const VOICE_PROFILES_SINGLE = {
  narrator: { rate: 0.9, pitch: 0.85 },
  you: { rate: 0.86, pitch: 1.0 },
  daughter: { rate: 1.07, pitch: 1.42 },
  guide: { rate: 0.92, pitch: 1.06 },
};

/**
 * Assign distinct Japanese voices to narrator, protagonist ('you'), and daughter
 * from the available browser voices when multiple voices exist.
 * @param {Array<SpeechSynthesisVoice>} voices
 * @returns {{ roleVoices: Record<string, SpeechSynthesisVoice|null>, distinctCount: number }}
 */
export function assignRoleVoices(voices) {
  if (!Array.isArray(voices) || !voices.length) {
    return { roleVoices: {}, distinctCount: 0 };
  }

  const jaVoicesRaw = voices.filter(
    (v) => typeof v?.lang === 'string' && v.lang.toLowerCase().startsWith('ja')
  );
  if (!jaVoicesRaw.length) {
    return { roleVoices: {}, distinctCount: 0 };
  }

  // Prefer ja-JP voices first and deduplicate by voiceURI/name
  const sortedJa = [
    ...jaVoicesRaw.filter((v) => v.lang.toLowerCase() === 'ja-jp'),
    ...jaVoicesRaw.filter((v) => v.lang.toLowerCase() !== 'ja-jp'),
  ];
  const seenIds = new Set();
  const pool = [];
  for (const voice of sortedJa) {
    const id = voice.voiceURI || voice.name || '';
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    pool.push(voice);
  }

  const usedIds = new Set();
  const getVoiceId = (v) => v?.voiceURI || v?.name || '';

  const pickVoiceForRole = (keywords) => {
    for (const kw of keywords) {
      const match = pool.find((v) => {
        const id = getVoiceId(v);
        return !usedIds.has(id) && (v.name || '').toLowerCase().includes(kw);
      });
      if (match) {
        usedIds.add(getVoiceId(match));
        return match;
      }
    }

    const unused = pool.find((v) => !usedIds.has(getVoiceId(v)));
    if (unused) {
      usedIds.add(getVoiceId(unused));
      return unused;
    }

    return pool[0] || null;
  };

  const narrator = pickVoiceForRole(ROLE_VOICE_KEYWORDS.narrator);
  const you = pickVoiceForRole(ROLE_VOICE_KEYWORDS.you);
  const daughter = pickVoiceForRole(ROLE_VOICE_KEYWORDS.daughter);
  const guide = narrator || pool[0] || null;

  const distinctCount = new Set(
    [narrator, you, daughter].map(getVoiceId).filter(Boolean)
  ).size;

  return {
    roleVoices: { narrator, you, daughter, guide },
    distinctCount,
  };
}

/**
 * Return senior-friendly speech rate and pitch profile based on speaker role.
 * When only a single Japanese voice exists on the device, widens pitch/rate
 * separation so characters remain distinguishable.
 * @param {string} speaker
 * @param {{ hasDistinctVoices?: boolean }} [options]
 * @returns {{ rate: number, pitch: number }}
 */
export function getSpeakerVoiceProfile(speaker, { hasDistinctVoices = true } = {}) {
  const role = getSpeakerRole(speaker);
  const table = hasDistinctVoices ? VOICE_PROFILES_DISTINCT : VOICE_PROFILES_SINGLE;
  return table[role] || table.narrator;
}

/**
 * Browser Web Speech API wrapper for reading story scenes aloud.
 */
export class SpeechPlayer {
  constructor() {
    this.enabled = true;
    this.roleVoices = {};
    this.hasDistinctVoices = false;
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
   * Assign available Japanese voices to character roles.
   */
  _refreshVoices() {
    if (!this.isSupported()) return;
    const voices = window.speechSynthesis.getVoices?.() || [];
    if (!voices.length) return;

    const { roleVoices, distinctCount } = assignRoleVoices(voices);
    this.roleVoices = roleVoices;
    this.hasDistinctVoices = distinctCount >= 2;
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
   * Speak the given text with role-appropriate voice, rate, and pitch.
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

    if (!Object.keys(this.roleVoices).length) {
      this._refreshVoices();
    }

    const role = getSpeakerRole(speaker);
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = 'ja-JP';
    if (this.roleVoices[role]) {
      utterance.voice = this.roleVoices[role];
    }

    const profile = getSpeakerVoiceProfile(speaker, {
      hasDistinctVoices: this.hasDistinctVoices,
    });
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
