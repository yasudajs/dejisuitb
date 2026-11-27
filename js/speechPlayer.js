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
 * @returns {'narrator'|'you'|'daughter'|'guide'|'praise'|'trap'}
 */
export function getSpeakerRole(speaker) {
  const name = (speaker || '').trim();
  if (name.includes('称賛') || name.includes('ほめ') || name === 'praise') {
    return 'praise';
  }
  if (name.includes('罠') || name.includes('警告') || name === 'trap') {
    return 'trap';
  }
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

const PREGENERATED_SCENE_IDS = new Set([
  'ep1_01',
  'ep1_02',
  'ep1_03',
  'ep1_04',
  'ep1_05',
  'ep1_06',
  'ep1_07',
  'ep1_08',
  'ep1_09',
  'ep1_url_1',
  'ep1_url_2',
  'ep1_url_choice',
  'ep1_app_1',
  'ep1_call_1',
  'ep1_call_2',
  'ep1_end_best',
  'ep1_end_recover',
  'ep1_end_learn',
]);

const VOICE_PROFILES_DISTINCT = {
  narrator: { rate: 0.9, pitch: 0.96 },
  you: { rate: 0.87, pitch: 0.94 },
  daughter: { rate: 1.05, pitch: 1.26 },
  guide: { rate: 0.92, pitch: 1.04 },
  praise: { rate: 0.98, pitch: 1.22 },
  trap: { rate: 0.94, pitch: 0.82 },
};

const VOICE_PROFILES_SINGLE = {
  narrator: { rate: 0.9, pitch: 0.85 },
  you: { rate: 0.86, pitch: 1.0 },
  daughter: { rate: 1.07, pitch: 1.42 },
  guide: { rate: 0.92, pitch: 1.06 },
  praise: { rate: 0.98, pitch: 1.3 },
  trap: { rate: 0.94, pitch: 0.76 },
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
  const praise = daughter || you || guide || pool[0] || null;
  const trap = narrator || guide || pool[0] || null;

  const distinctCount = new Set(
    [narrator, you, daughter].map(getVoiceId).filter(Boolean)
  ).size;

  return {
    roleVoices: { narrator, you, daughter, guide, praise, trap },
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
    this._currentAudio = null;
    this._missingAudioUrls = new Set();
    this._audioCtx = null;

    if (this._isWebSpeechSupported()) {
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
   * Check whether browser Web Speech synthesis is available.
   * @returns {boolean}
   */
  _isWebSpeechSupported() {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  /**
   * Check whether audio file playback or Web Speech synthesis is available.
   * @returns {boolean}
   */
  isSupported() {
    return this._isWebSpeechSupported() || typeof Audio !== 'undefined';
  }

  /**
   * Assign available Japanese voices to character roles.
   */
  _refreshVoices() {
    if (!this._isWebSpeechSupported()) return;
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
   * Immediately cancel any pending timer, active WAV audio, or queued speech synthesis.
   */
  stop() {
    if (this._pendingTimer !== null) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    this._currentUtterance = null;

    if (this._currentAudio) {
      const audio = this._currentAudio;
      this._currentAudio = null;
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore audio element reset errors
      }
    }

    if (!this._isWebSpeechSupported()) return;
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
    if (!this._isWebSpeechSupported()) {
      this.stop();
      return false;
    }

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
   * Lazily initialize Web Audio context inside a user gesture or playback flow.
   * @returns {AudioContext|null}
   */
  _getAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      if (!this._audioCtx) {
        this._audioCtx = new AudioCtx();
      }
      if (this._audioCtx.state === 'suspended' && typeof this._audioCtx.resume === 'function') {
        this._audioCtx.resume().catch(() => {});
      }
      return this._audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Schedule a single synthesized tone with smooth attack and decay.
   * @param {AudioContext} ctx
   * @param {number} startTime
   * @param {number} freq
   * @param {number} duration
   * @param {{ type?: OscillatorType, peak?: number, endFreq?: number|null }} [options]
   */
  _playTone(ctx, startTime, freq, duration, { type = 'sine', peak = 0.14, endFreq = null } = {}) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (endFreq && endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /**
   * Play lightweight celebratory or warning sound effects via Web Audio API.
   * @param {'praise'|'trap'|'apple'|'fanfare'} type
   */
  playSfx(type) {
    if (!this.enabled) return;
    const ctx = this._getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + 0.01;
      if (type === 'praise') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          this._playTone(ctx, now + idx * 0.08, freq, 0.24, {
            type: idx === 3 ? 'sine' : 'triangle',
            peak: idx === 3 ? 0.16 : 0.13,
          });
        });
      } else if (type === 'trap') {
        // Sharp wooden clapper pop followed by dramatic low descending warning tones
        this._playTone(ctx, now, 980, 0.06, { type: 'square', peak: 0.08, endFreq: 380 });
        [392, 311.13, 233.08].forEach((freq, idx) => {
          this._playTone(ctx, now + 0.04 + idx * 0.11, freq, 0.24, {
            type: idx === 0 ? 'triangle' : 'sawtooth',
            peak: idx === 0 ? 0.12 : 0.075,
          });
        });
      } else if (type === 'apple') {
        this._playTone(ctx, now, 783.99, 0.13, { type: 'sine', peak: 0.14 });
        this._playTone(ctx, now + 0.075, 1046.5, 0.22, { type: 'sine', peak: 0.16 });
      } else if (type === 'fanfare') {
        const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1318.5];
        notes.forEach((freq, idx) => {
          const t = now + idx * 0.085;
          const isFinal = idx === notes.length - 1;
          this._playTone(ctx, t, freq, isFinal ? 0.65 : 0.22, {
            type: isFinal ? 'triangle' : 'sine',
            peak: isFinal ? 0.16 : 0.12,
          });
        });
        // Warm ending chord + shimmer overtones
        [523.25, 659.25, 783.99, 1046.5].forEach((freq) => {
          this._playTone(ctx, now + 0.56, freq, 0.72, { type: 'triangle', peak: 0.07 });
        });
        [1567.98, 2093.0].forEach((freq, idx) => {
          this._playTone(ctx, now + 0.68 + idx * 0.1, freq, 0.35, { type: 'sine', peak: 0.06 });
        });
      }
    } catch {
      // Ignore audio scheduling errors in restricted browser environments
    }
  }

  /**
   * Play feedback SFX and speak feedback text with praise or trap voice styling.
   * @param {string} text
   * @param {'praise'|'trap'|'fanfare'} [kind]
   * @returns {boolean}
   */
  speakFeedback(text, kind = 'praise') {
    if (!this.enabled) return false;
    this.playSfx(kind);
    return this.speak(text, { speaker: kind === 'trap' ? '罠' : '称賛' });
  }

  /**
   * Play a pre-generated audio file (e.g. AivisSpeech WAV) with optional Web Speech fallback.
   * @param {string} url
   * @param {{ fallbackText?: string, fallbackSpeaker?: string, force?: boolean }} [options]
   * @returns {boolean}
   */
  playAudioFile(url, { fallbackText = '', fallbackSpeaker = '', force = false } = {}) {
    if (!this.enabled && !force) return false;
    this.stop();

    if (!url || typeof Audio === 'undefined' || this._missingAudioUrls.has(url)) {
      return fallbackText ? this.speak(fallbackText, { speaker: fallbackSpeaker }) : false;
    }

    const audio = new Audio(url);
    audio.preload = 'auto';
    this._currentAudio = audio;

    const fallbackToSpeech = () => {
      if (this._currentAudio === audio) {
        this._currentAudio = null;
      }
      this._missingAudioUrls.add(url);
      if (fallbackText && (this.enabled || force)) {
        this.speak(fallbackText, { speaker: fallbackSpeaker });
      }
    };

    audio.onended = () => {
      if (this._currentAudio === audio) {
        this._currentAudio = null;
      }
    };
    audio.onerror = fallbackToSpeech;

    try {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          if (err?.name === 'NotAllowedError') {
            if (this._currentAudio === audio) {
              this._currentAudio = null;
            }
            return;
          }
          fallbackToSpeech();
        });
      }
      return true;
    } catch {
      fallbackToSpeech();
      return false;
    }
  }

  /**
   * Resolve pre-generated AivisSpeech WAV URL for a scenario scene if present.
   * @param {Record<string, string>|null|undefined} scene
   * @returns {string}
   */
  getSceneAudioUrl(scene) {
    const explicit = (scene?.audio_file || '').trim();
    if (explicit) return explicit;
    const sceneId = (scene?.scene_id || '').trim();
    if (PREGENERATED_SCENE_IDS.has(sceneId)) {
      return `./public/sounds/${sceneId}.wav`;
    }
    return '';
  }

  /**
   * Speak a scenario scene using pre-generated WAV if available, or Web Speech fallback.
   * @param {Record<string, string>|null|undefined} scene
   * @param {{ force?: boolean }} [options]
   * @returns {boolean}
   */
  speakScene(scene, { force = false } = {}) {
    if (!scene) return false;
    if (!this.enabled && !force) return false;

    const text = scene.text || '';
    const speaker = (scene.speaker || '').trim();
    const audioUrl = this.getSceneAudioUrl(scene);
    if (audioUrl) {
      return this.playAudioFile(audioUrl, {
        fallbackText: text,
        fallbackSpeaker: speaker,
        force,
      });
    }
    return this.speak(text, { speaker });
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
    return this.speakScene(scene, { force: false });
  }
}
