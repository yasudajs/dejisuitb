import { loadCSV } from './csvParser.js';
import { SpeechPlayer } from './speechPlayer.js';

const PRAISE_PHRASES = [
  {
    display: 'お見事！',
    sub: 'すばらしい判断です！',
    speech: 'お見事！すばらしい判断ですね！',
  },
  {
    display: 'ご名答！',
    sub: 'よく見抜きましたね！',
    speech: 'ご名答！しっかり見抜きましたね！',
  },
  {
    display: 'あっぱれ！',
    sub: '見事な対応です！',
    speech: 'あっぱれ！本当に見事な対応です！',
  },
];

const TRAP_PHRASES = [
  {
    display: '引っかかったな！',
    sub: '危ない！詐欺の手口に気をつけましょう',
    speech: '引っかかったな！一度立ち止まって確認しましょう！',
  },
  {
    display: 'あぶない！',
    sub: 'そのまま進むと危険な場面です',
    speech: 'あぶない！危うく詐欺の罠にかかるところでしたよ！',
  },
  {
    display: 'そこが罠じゃ！',
    sub: 'あわてず立ち止まるのが大切です',
    speech: 'そこが罠じゃ！あわてずに気をつけましょう！',
  },
];

/**
 * Check whether an episode uses the Episode 1 apple collection mechanic.
 * @param {Record<string, string>|null|undefined} episode
 * @returns {boolean}
 */
export function isAppleEpisode(episode) {
  return String(episode?.episode_id || '').trim() === '1';
}

/**
 * Compute total apples achievable on a perfect run (SMS clues + optimal choice count).
 * @param {Array<Record<string, string>>} scenes
 * @param {number} totalClues
 * @returns {number}
 */
export function computeEpisodeAppleGoal(scenes, totalClues) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return Math.max(1, totalClues + 1);
  }

  const sceneMap = new Map();
  scenes.forEach((raw) => {
    const id = (raw.scene_id || '').trim();
    if (!id) return;
    sceneMap.set(id, {
      ...raw,
      scene_id: id,
      scene_type: (raw.scene_type || 'narration').trim(),
      next_scene_id: (raw.next_scene_id || '').trim(),
      choice1_next: (raw.choice1_next || '').trim(),
      choice2_next: (raw.choice2_next || '').trim(),
      choice3_next: (raw.choice3_next || '').trim(),
    });
  });

  const startId = (scenes[0].scene_id || '').trim();
  if (!startId || !sceneMap.has(startId)) {
    return Math.max(1, totalClues + 1);
  }

  function dfs(sceneId, visited) {
    if (!sceneId || visited.has(sceneId) || !sceneMap.has(sceneId)) {
      return { score: 0, choices: 0 };
    }
    const scene = sceneMap.get(sceneId);
    if (scene.scene_type === 'result') {
      return { score: 0, choices: 0 };
    }

    const nextVisited = new Set(visited);
    nextVisited.add(sceneId);

    if (scene.scene_type === 'choice') {
      let best = { score: -1, choices: 0 };
      for (let i = 1; i <= 3; i++) {
        const nextId = scene[`choice${i}_next`];
        if (!nextId) continue;
        const pts = Number.parseInt(scene[`choice${i}_score`] || '0', 10) || 0;
        const sub = dfs(nextId, nextVisited);
        const totalScore = pts + sub.score;
        const totalChoices = (pts > 0 ? 1 : 0) + sub.choices;
        if (totalScore > best.score) {
          best = { score: totalScore, choices: totalChoices };
        }
      }
      return best.score >= 0 ? best : { score: 0, choices: 0 };
    }

    if (scene.next_scene_id) {
      return dfs(scene.next_scene_id, nextVisited);
    }
    return { score: 0, choices: 0 };
  }

  const optimal = dfs(startId, new Set());
  return Math.max(1, totalClues + Math.max(1, optimal.choices));
}

/**
 * Create a gleaming Golden Apple inline SVG illustration.
 * @returns {SVGSVGElement}
 */
function createGoldenAppleSvg() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 160');
  svg.setAttribute('class', 'golden-apple-svg');
  svg.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(svgNS, 'defs');

  const bodyGrad = document.createElementNS(svgNS, 'radialGradient');
  bodyGrad.setAttribute('id', 'goldenAppleBodyGrad');
  bodyGrad.setAttribute('cx', '36%');
  bodyGrad.setAttribute('cy', '30%');
  bodyGrad.setAttribute('r', '70%');
  [
    ['0%', '#fffde4'],
    ['28%', '#fde047'],
    ['68%', '#f59e0b'],
    ['100%', '#b45309'],
  ].forEach(([offset, color]) => {
    const stop = document.createElementNS(svgNS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    bodyGrad.appendChild(stop);
  });

  const leafGrad = document.createElementNS(svgNS, 'linearGradient');
  leafGrad.setAttribute('id', 'goldenAppleLeafGrad');
  leafGrad.setAttribute('x1', '0%');
  leafGrad.setAttribute('y1', '0%');
  leafGrad.setAttribute('x2', '100%');
  leafGrad.setAttribute('y2', '100%');
  [
    ['0%', '#fef08a'],
    ['55%', '#84cc16'],
    ['100%', '#15803d'],
  ].forEach(([offset, color]) => {
    const stop = document.createElementNS(svgNS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    leafGrad.appendChild(stop);
  });

  defs.appendChild(bodyGrad);
  defs.appendChild(leafGrad);
  svg.appendChild(defs);

  // Soft outer aura ring
  const aura = document.createElementNS(svgNS, 'circle');
  aura.setAttribute('cx', '80');
  aura.setAttribute('cy', '88');
  aura.setAttribute('r', '60');
  aura.setAttribute('fill', 'rgba(253, 224, 71, 0.28)');
  svg.appendChild(aura);

  // Stem
  const stem = document.createElementNS(svgNS, 'path');
  stem.setAttribute('d', 'M80 42 C78 27, 83 18, 90 14');
  stem.setAttribute('fill', 'none');
  stem.setAttribute('stroke', '#78350f');
  stem.setAttribute('stroke-width', '7');
  stem.setAttribute('stroke-linecap', 'round');
  svg.appendChild(stem);

  // Leaf
  const leaf = document.createElementNS(svgNS, 'path');
  leaf.setAttribute('d', 'M82 34 C94 14, 118 16, 121 31 C108 42, 92 40, 82 34 Z');
  leaf.setAttribute('fill', 'url(#goldenAppleLeafGrad)');
  leaf.setAttribute('stroke', '#92400e');
  leaf.setAttribute('stroke-width', '2.5');
  svg.appendChild(leaf);

  // Apple body
  const body = document.createElementNS(svgNS, 'path');
  body.setAttribute(
    'd',
    'M80 45 C65 36, 35 42, 31 74 C27 108, 49 142, 68 142 C74 142, 77 139, 80 139 C83 139, 86 142, 92 142 C111 142, 133 108, 129 74 C125 42, 95 36, 80 45 Z'
  );
  body.setAttribute('fill', 'url(#goldenAppleBodyGrad)');
  body.setAttribute('stroke', '#92400e');
  body.setAttribute('stroke-width', '3.5');
  svg.appendChild(body);

  // Gloss highlight
  const highlight = document.createElementNS(svgNS, 'ellipse');
  highlight.setAttribute('cx', '57');
  highlight.setAttribute('cy', '71');
  highlight.setAttribute('rx', '11');
  highlight.setAttribute('ry', '20');
  highlight.setAttribute('transform', 'rotate(-20 57 71)');
  highlight.setAttribute('fill', 'rgba(255, 255, 255, 0.72)');
  svg.appendChild(highlight);

  const highlightDot = document.createElementNS(svgNS, 'circle');
  highlightDot.setAttribute('cx', '49');
  highlightDot.setAttribute('cy', '96');
  highlightDot.setAttribute('r', '4.5');
  highlightDot.setAttribute('fill', 'rgba(255, 255, 255, 0.65)');
  svg.appendChild(highlightDot);

  // Radiating sparkle stars
  const sparkles = [
    'M23 44 L26 52 L34 55 L26 58 L23 66 L20 58 L12 55 L20 52 Z',
    'M135 48 L137.5 54.5 L144 57 L137.5 59.5 L135 66 L132.5 59.5 L126 57 L132.5 54.5 Z',
    'M130 118 L132 123 L137 125 L132 127 L130 132 L128 127 L123 125 L128 123 Z',
  ];
  sparkles.forEach((d) => {
    const star = document.createElementNS(svgNS, 'path');
    star.setAttribute('d', d);
    star.setAttribute('fill', '#fef08a');
    star.setAttribute('stroke', '#b45309');
    star.setAttribute('stroke-width', '1.2');
    svg.appendChild(star);
  });

  return svg;
}

/**
 * Parse [[visible text|explanation]] tokens into ordered segments.
 * @param {string} rawText
 * @param {number} startIndex
 * @returns {{ segments: Array<{type: 'text'|'clue', text: string, explanation?: string, clueId?: number}>, nextIndex: number }}
 */
export function parseClueTokens(rawText, startIndex = 0) {
  const text = rawText || '';
  const regex = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
  const segments = [];
  let lastPos = 0;
  let clueIndex = startIndex;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastPos) {
      segments.push({
        type: 'text',
        text: text.slice(lastPos, match.index),
      });
    }
    segments.push({
      type: 'clue',
      text: match[1],
      explanation: match[2],
      clueId: clueIndex,
    });
    clueIndex += 1;
    lastPos = regex.lastIndex;
  }

  if (lastPos < text.length) {
    segments.push({
      type: 'text',
      text: text.slice(lastPos),
    });
  }

  return { segments, nextIndex: clueIndex };
}

/**
 * Compute the maximum achievable actionScore from the starting scene to any result scene.
 * Uses cycle-safe DFS so contributors editing scenario CSVs do not break calculation.
 * @param {Array<Record<string, string>>} scenes
 * @returns {number}
 */
export function computeMaxActionScore(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) return 0;

  const sceneMap = new Map();
  scenes.forEach((raw) => {
    const id = (raw.scene_id || '').trim();
    if (!id) return;
    sceneMap.set(id, {
      ...raw,
      scene_id: id,
      scene_type: (raw.scene_type || 'narration').trim(),
      next_scene_id: (raw.next_scene_id || '').trim(),
      choice1_next: (raw.choice1_next || '').trim(),
      choice2_next: (raw.choice2_next || '').trim(),
      choice3_next: (raw.choice3_next || '').trim(),
    });
  });

  const startId = (scenes[0].scene_id || '').trim();
  if (!startId || !sceneMap.has(startId)) return 0;

  function dfs(sceneId, visited) {
    if (!sceneId || visited.has(sceneId) || !sceneMap.has(sceneId)) {
      return 0;
    }
    const scene = sceneMap.get(sceneId);
    if (scene.scene_type === 'result') {
      return 0;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(sceneId);

    if (scene.scene_type === 'choice') {
      let best = 0;
      let hasChoice = false;
      for (let i = 1; i <= 3; i++) {
        const nextId = scene[`choice${i}_next`];
        if (!nextId) continue;
        hasChoice = true;
        const score = Number.parseInt(scene[`choice${i}_score`] || '0', 10) || 0;
        const branchTotal = score + dfs(nextId, nextVisited);
        if (branchTotal > best) {
          best = branchTotal;
        }
      }
      return hasChoice ? best : 0;
    }

    if (scene.next_scene_id) {
      return dfs(scene.next_scene_id, nextVisited);
    }
    return 0;
  }

  return dfs(startId, new Set());
}

/**
 * Evaluate result level ('good' | 'caution' | 'bad' | 'neutral') from actionScore / maxActionScore.
 * @param {number} actionScore
 * @param {number} maxActionScore
 * @returns {{ level: 'good'|'caution'|'bad'|'neutral', badge: string, summary: string }}
 */
export function evaluateResultLevel(actionScore, maxActionScore) {
  if (!maxActionScore || maxActionScore <= 0) {
    return {
      level: 'neutral',
      badge: '📖 確認おわり',
      summary:
        'ダミー画面のプレビューが完了しました。本編が完成すると安全行動スコアに応じた良い・危険の判定もここに表示されます。',
    };
  }

  const ratio = actionScore / maxActionScore;
  if (ratio >= 0.75) {
    return {
      level: 'good',
      badge: '✅ 良い結果：安全な行動ができました！',
      summary:
        'すばらしい判断です！怪しい連絡に慌てず、被害を防ぐ安全な行動がしっかり選べています。',
    };
  }
  if (ratio >= 0.35) {
    return {
      level: 'caution',
      badge: '⚠️ もう一歩：途中で危険に気づけました',
      summary:
        '途中まではヒヤッとしましたが、大事なところで立ち止まれました。次は最初のメッセージの時点で見抜いてみましょう！',
    };
  }
  return {
    level: 'bad',
    badge: '🚨 危険な結果：本番なら被害にあっていた行動です',
    summary:
      '偽サイトへ大切な情報を入力してしまうと、お金や個人情報を盗まれる大変危険な行動でした。どこで引き返せたか、下のポイントを一緒に確認しましょう！',
  };
}

/**
 * Evaluate clue discovery level ('good' | 'caution' | 'bad' | 'neutral').
 * 0 -> red (bad), partial -> yellow (caution), all -> green (good).
 * @param {number} discoveredCount
 * @param {number} totalClues
 * @returns {{ level: 'good'|'caution'|'bad'|'neutral', note: string }}
 */
export function evaluateClueLevel(discoveredCount, totalClues) {
  if (!totalClues || totalClues <= 0) {
    return { level: 'neutral', note: '' };
  }
  if (discoveredCount <= 0) {
    return { level: 'bad', note: '怪しい点を見逃してしまいました' };
  }
  if (discoveredCount >= totalClues) {
    return { level: 'good', note: 'すべて見つけられました！' };
  }
  return { level: 'caution', note: '一部見つけられました（あと少し！）' };
}

/**
 * Resolve a scene's image field relative to the episode's scenario folder.
 * @param {string} scenarioDir
 * @param {string} imageField
 * @returns {string}
 */
export function resolveSceneImage(scenarioDir, imageField) {
  const raw = (imageField || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|\/|\.\/|data:)/i.test(raw)) {
    return raw;
  }
  const base = scenarioDir.endsWith('/') ? scenarioDir : `${scenarioDir}/`;
  return `${base}${raw}`;
}

/**
 * Create a responsive scene illustration figure that hides cleanly if missing.
 * @param {string} imageUrl
 * @param {string} altText
 * @returns {HTMLElement}
 */
function createSceneImageFigure(imageUrl, altText) {
  const figure = el('figure', 'novel-scene-figure');
  const img = document.createElement('img');
  img.className = 'novel-scene-img';
  img.src = imageUrl;
  img.alt = altText || '場面のイラスト';
  img.addEventListener('error', () => {
    figure.hidden = true;
  });
  figure.appendChild(img);
  return figure;
}

/**
 * Helper to create a DOM element safely with textContent and classes.
 */
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

/**
 * Sound Novel Engine for Pillar 1 (疑似体験ゲーム).
 */
export class NovelEngine {
  /**
   * @param {HTMLElement} container
   * @param {{ onNavigateEpisodes: () => void, onNavigateDb: () => void }} callbacks
   */
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.state = null;
    this.speechPlayer = new SpeechPlayer();
    this._effectTimers = [];
    this._lastPraiseIdx = -1;
    this._lastTrapIdx = -1;
  }

  /**
   * Clear any pending animation or transition timers.
   */
  clearEffectTimers() {
    if (Array.isArray(this._effectTimers)) {
      this._effectTimers.forEach((timerId) => clearTimeout(timerId));
    }
    this._effectTimers = [];
  }

  /**
   * Pick a phrase entry randomly without immediately repeating the previous phrase.
   * @param {Array<{display: string, sub: string, speech: string}>} list
   * @param {'_lastPraiseIdx'|'_lastTrapIdx'} lastKey
   */
  _pickPhrase(list, lastKey) {
    if (!list.length) return { display: '', sub: '', speech: '' };
    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && idx === this[lastKey]) {
      idx = (idx + 1) % list.length;
    }
    this[lastKey] = idx;
    return list[idx];
  }

  /**
   * Check whether the current episode clear qualifies as a zero-mistake full-score clear.
   * @returns {boolean}
   */
  _isPerfectClear() {
    if (!this.state) return false;
    const { actionScore, maxActionScore, wrongChoiceCount } = this.state;
    return maxActionScore > 0 && actionScore >= maxActionScore && wrongChoiceCount === 0;
  }

  /**
   * Stop any active browser speech synthesis, effect timers, and open choice overlays.
   */
  stopSpeech() {
    this.clearEffectTimers();
    this.speechPlayer?.stop();
    this.container?.querySelectorAll('.choice-callout-overlay').forEach((node) => node.remove());
  }

  /**
   * Start an episode (playable or dummy preview).
   * @param {Record<string, string>} episode
   * @param {boolean} forcePlayDummy
   */
  async startEpisode(episode, forcePlayDummy = false) {
    this.stopSpeech();
    this.container.innerHTML = '';
    const loadingBox = el('div', 'card state-box', 'お話を読み込んでいます…');
    this.container.appendChild(loadingBox);

    if (episode.status === 'dummy' && !forcePlayDummy) {
      this.renderDummyPreview(episode);
      return;
    }

    try {
      const cleanPath = (episode.scenario_file || '').trim().replace(/^\.?\//, '');
      const lastSlash = cleanPath.lastIndexOf('/');
      const scenarioDir = lastSlash >= 0 ? `./${cleanPath.slice(0, lastSlash + 1)}` : './';
      const scenes = await loadCSV(`./${cleanPath}`);
      if (!scenes.length) {
        throw new Error('シナリオデータが空です。');
      }

      const sceneMap = new Map();
      const sceneOrder = new Map();
      let totalClues = 0;

      scenes.forEach((rawScene, idx) => {
        const scene = {
          ...rawScene,
          scene_id: (rawScene.scene_id || '').trim(),
          scene_type: (rawScene.scene_type || 'narration').trim(),
          image: (rawScene.image || '').trim(),
          next_scene_id: (rawScene.next_scene_id || '').trim(),
          choice1_next: (rawScene.choice1_next || '').trim(),
          choice2_next: (rawScene.choice2_next || '').trim(),
          choice3_next: (rawScene.choice3_next || '').trim(),
        };
        if (scene.scene_id) {
          sceneMap.set(scene.scene_id, scene);
          sceneOrder.set(scene.scene_id, idx);
        }
        if (scene.scene_type === 'sms') {
          const senderParsed = parseClueTokens(scene.sms_sender, 0);
          const bodyParsed = parseClueTokens(scene.sms_body, senderParsed.nextIndex);
          totalClues += bodyParsed.nextIndex;
        }
      });

      const maxActionScore = computeMaxActionScore(scenes);
      const appleMode = isAppleEpisode(episode);
      const appleGoal = appleMode ? computeEpisodeAppleGoal(scenes, totalClues) : 0;

      this.state = {
        episode,
        scenarioDir,
        scenes,
        sceneMap,
        sceneOrder,
        currentSceneId: scenes[0].scene_id.trim(),
        history: [],
        actionScore: 0,
        maxActionScore,
        discoveredClues: new Set(),
        totalClues,
        activeClueFeedback: null,
        showHint: false,
        isAppleMode: appleMode,
        appleGoal,
        earnedAppleIds: new Set(),
        latestAppleGain: false,
        wrongChoiceCount: 0,
        correctChoiceCount: 0,
        activeChoiceFeedback: null,
      };

      this.renderCurrentScene({ autoSpeak: true });
    } catch (err) {
      this.container.innerHTML = '';
      const errBox = el('div', 'card state-box');
      errBox.appendChild(el('h2', 'section-title', 'お話を読み込めませんでした'));
      errBox.appendChild(
        el(
          'p',
          'lead-text',
          'ファイルを読み込む途中でうまくいきませんでした。通信状態やファイル名をご確認のうえ、もう一度お試しください。'
        )
      );
      errBox.appendChild(el('p', 'muted-note', err.message));
      const backBtn = el('button', 'btn btn-primary btn-large', 'お話一覧へもどる');
      backBtn.type = 'button';
      backBtn.addEventListener('click', () => this.callbacks.onNavigateEpisodes());
      errBox.appendChild(backBtn);
      this.container.appendChild(errBox);
    }
  }

  /**
   * Render a friendly preview screen for dummy episodes (2..15).
   * @param {Record<string, string>} episode
   */
  renderDummyPreview(episode) {
    this.stopSpeech();
    this.container.innerHTML = '';
    const card = el('article', 'card novel-preview-card');

    const badgeRow = el('div', 'badge-row');
    badgeRow.appendChild(el('span', 'badge badge-series', episode.series));
    badgeRow.appendChild(el('span', 'badge badge-category', episode.category));
    badgeRow.appendChild(el('span', 'badge badge-dummy', '準備中（ダミー）'));
    card.appendChild(badgeRow);

    card.appendChild(
      el('h2', 'novel-episode-heading', `第${episode.episode_id}話「${episode.episode_title}」`)
    );

    const summaryBox = el('div', 'info-panel');
    summaryBox.appendChild(el('h3', 'panel-heading', 'どんなお話？'));
    summaryBox.appendChild(el('p', 'panel-body', episode.summary));
    card.appendChild(summaryBox);

    const goalBox = el('div', 'info-panel info-panel-teal');
    goalBox.appendChild(el('h3', 'panel-heading', 'このお話で身につく行動ルール'));
    goalBox.appendChild(el('p', 'panel-body', episode.learning_goal));
    card.appendChild(goalBox);

    const cleanScenarioFile = (episode.scenario_file || '').trim();
    const folderPath = cleanScenarioFile.includes('/')
      ? cleanScenarioFile.slice(0, cleanScenarioFile.lastIndexOf('/') + 1)
      : 'data/scenarios/';

    const noticeBox = el('div', 'info-panel info-panel-amber');
    noticeBox.appendChild(el('h3', 'panel-heading', '制作・編集担当者の方へ'));
    noticeBox.appendChild(
      el(
        'p',
        'panel-body',
        `第2話以降は順次作成中です。担当者は「${cleanScenarioFile}」を編集し、同じフォルダ（${folderPath}）にイラスト画像を入れて「data/episodes.csv」の status を playable に変更すると本編として公開できます。`
      )
    );
    card.appendChild(noticeBox);

    const actions = el('div', 'action-stack');
    const tryDummyBtn = el(
      'button',
      'btn btn-secondary btn-large',
      'ダミー用テンプレート画面を試してみる'
    );
    tryDummyBtn.type = 'button';
    tryDummyBtn.addEventListener('click', () => this.startEpisode(episode, true));

    const backListBtn = el('button', 'btn btn-primary btn-large', 'お話一覧へもどる');
    backListBtn.type = 'button';
    backListBtn.addEventListener('click', () => this.callbacks.onNavigateEpisodes());

    actions.appendChild(tryDummyBtn);
    actions.appendChild(backListBtn);
    card.appendChild(actions);

    this.container.appendChild(card);
  }

  /**
   * Push snapshot and transition to next scene ID.
   * @param {string} nextSceneId
   * @param {number} scoreDelta
   * @param {{ appleKey?: string|null, choiceOutcome?: 'correct'|'wrong'|null }} [meta]
   */
  advanceTo(nextSceneId, scoreDelta = 0, meta = {}) {
    if (!this.state) return;
    const targetId = (nextSceneId || '').trim();
    if (!targetId || !this.state.sceneMap.has(targetId)) {
      return;
    }

    this.clearEffectTimers();

    this.state.history.push({
      sceneId: this.state.currentSceneId,
      actionScore: this.state.actionScore,
      discoveredClues: new Set(this.state.discoveredClues),
      earnedAppleIds: new Set(this.state.earnedAppleIds),
      wrongChoiceCount: this.state.wrongChoiceCount,
      correctChoiceCount: this.state.correctChoiceCount,
    });

    this.state.actionScore += scoreDelta;

    let gainedApple = false;
    if (meta.appleKey && this.state.isAppleMode && !this.state.earnedAppleIds.has(meta.appleKey)) {
      this.state.earnedAppleIds.add(meta.appleKey);
      gainedApple = true;
    }
    if (meta.choiceOutcome === 'correct') {
      this.state.correctChoiceCount += 1;
    } else if (meta.choiceOutcome === 'wrong') {
      this.state.wrongChoiceCount += 1;
    }

    this.state.currentSceneId = targetId;
    this.state.activeClueFeedback = null;
    this.state.activeChoiceFeedback = null;
    this.state.latestAppleGain = gainedApple;
    this.state.showHint = false;

    this.renderCurrentScene({ autoSpeak: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Step back to previous scene inside the sound novel.
   */
  stepBack() {
    if (!this.state || this.state.history.length === 0) return;
    this.clearEffectTimers();
    const prev = this.state.history.pop();
    this.state.currentSceneId = prev.sceneId;
    this.state.actionScore = prev.actionScore;
    this.state.discoveredClues = prev.discoveredClues;
    this.state.earnedAppleIds = prev.earnedAppleIds || new Set();
    this.state.wrongChoiceCount = prev.wrongChoiceCount || 0;
    this.state.correctChoiceCount = prev.correctChoiceCount || 0;
    this.state.activeClueFeedback = null;
    this.state.activeChoiceFeedback = null;
    this.state.latestAppleGain = false;
    this.state.showHint = false;
    this.renderCurrentScene({ autoSpeak: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Render the active scene card.
   * @param {{ autoSpeak?: boolean }} [options]
   */
  renderCurrentScene({ autoSpeak = false } = {}) {
    if (!this.state) return;
    this.clearEffectTimers();
    const { episode, sceneMap, sceneOrder, currentSceneId, scenes } = this.state;
    const scene = sceneMap.get(currentSceneId);
    if (!scene) return;

    this.container.innerHTML = '';

    // Episode subheader + progress
    const header = el('div', 'novel-header card-compact');
    const titleRow = el('div', 'novel-title-row');
    titleRow.appendChild(
      el('span', 'novel-ep-tag', `第${episode.episode_id}話`)
    );
    titleRow.appendChild(el('h2', 'novel-ep-name', episode.episode_title));
    header.appendChild(titleRow);

    const stepNum = (sceneOrder.get(currentSceneId) ?? 0) + 1;
    const totalSteps = scenes.length;
    const pct = Math.min(100, Math.round((stepNum / totalSteps) * 100));

    const progressMeta = el('div', 'progress-meta');
    progressMeta.appendChild(el('span', 'progress-label', `場面 ${stepNum} / ${totalSteps}`));
    if (this.state.totalClues > 0) {
      progressMeta.appendChild(
        el(
          'span',
          'clue-counter-pill',
          `見つけた怪しい点：${this.state.discoveredClues.size} / ${this.state.totalClues}個`
        )
      );
    }
    header.appendChild(progressMeta);

    const progressTrack = el('div', 'progress-track');
    progressTrack.setAttribute('aria-hidden', 'true');
    const progressFill = el('div', 'progress-fill');
    progressFill.style.width = `${pct}%`;
    progressTrack.appendChild(progressFill);
    header.appendChild(progressTrack);

    // Scene body by scene_type (render main game/result card above progress header)
    if (scene.scene_type === 'result') {
      if (autoSpeak && !this._isPerfectClear()) {
        this.speechPlayer.speakSceneIfEnabled(scene);
      }
      this.renderResultScene(scene, { autoSpeak });
      this.container.appendChild(header);
      return;
    }

    const stage = el('section', 'card novel-stage');

    if (this.state.isAppleMode) {
      stage.appendChild(this.renderAppleHud());
      this.state.latestAppleGain = false;
    }

    // Scene illustration (from the episode's own folder)
    const sceneImageUrl = resolveSceneImage(this.state.scenarioDir, scene.image);
    if (sceneImageUrl) {
      stage.appendChild(
        createSceneImageFigure(
          sceneImageUrl,
          `第${episode.episode_id}話「${episode.episode_title}」の場面イラスト`
        )
      );
    }

    // Speaker badge + speech controls
    const speaker = (scene.speaker || '').trim();
    const speechSupported = this.speechPlayer.isSupported();
    if (speaker || speechSupported) {
      const speakerRow = el('div', 'novel-speaker-row');
      if (speaker) {
        let speakerClass = 'speaker-badge';
        if (speaker.includes('あなた')) speakerClass += ' speaker-you';
        else if (speaker.includes('娘') || speaker.includes('家族')) speakerClass += ' speaker-family';
        else if (speaker.includes('案内')) speakerClass += ' speaker-guide';
        else speakerClass += ' speaker-narration';
        speakerRow.appendChild(el('div', speakerClass, speaker));
      }

      if (speechSupported) {
        speakerRow.appendChild(this._createSpeechControls(scene));
      }

      stage.appendChild(speakerRow);
    }

    // Main novel text
    const bodyText = el('p', 'novel-text', scene.text);
    stage.appendChild(bodyText);

    // Special interactive blocks
    if (scene.scene_type === 'sms') {
      this.renderSmsBlock(stage, scene);
    } else if (scene.scene_type === 'choice') {
      this.renderChoiceBlock(stage, scene);
    }

    // Footer controls (Back one scene + Next button when applicable)
    const footer = el('div', 'novel-footer');
    if (this.state.history.length > 0) {
      const prevBtn = el('button', 'btn btn-outline btn-large', '◀ 前の場面にもどる');
      prevBtn.type = 'button';
      prevBtn.addEventListener('click', () => this.stepBack());
      footer.appendChild(prevBtn);
    }

    if (scene.scene_type !== 'choice' && scene.next_scene_id) {
      const nextLabel = scene.scene_type === 'sms' ? '確認を終えて次へ進む ▶' : 'つぎへ ▶';
      const nextBtn = el('button', 'btn btn-primary btn-large', nextLabel);
      nextBtn.type = 'button';
      nextBtn.addEventListener('click', () => this.advanceTo(scene.next_scene_id, 0));
      footer.appendChild(nextBtn);
    }

    stage.appendChild(footer);
    this.container.appendChild(stage);
    this.container.appendChild(header);

    if (autoSpeak) {
      this.speechPlayer.speakSceneIfEnabled(scene);
    }
  }

  /**
   * Build replay and mute/unmute buttons for the active scene.
   * @param {Record<string, string>} scene
   * @returns {HTMLElement}
   */
  _createSpeechControls(scene) {
    const controls = el('div', 'novel-speech-controls');
    const speaker = (scene.speaker || '').trim();
    const hasText = Boolean((scene.text || '').trim());

    if (hasText) {
      const replayBtn = el('button', 'btn btn-small btn-speech-replay', '🔁 もういちど聞く');
      replayBtn.type = 'button';
      replayBtn.addEventListener('click', () => {
        this.speechPlayer.speak(scene.text, { speaker });
      });
      controls.appendChild(replayBtn);
    }

    const enabled = this.speechPlayer.enabled;
    const toggleBtn = el(
      'button',
      `btn btn-small btn-speech-toggle ${enabled ? 'is-on' : 'is-off'}`,
      enabled ? '🔊 音声読み上げ：オン' : '🔇 音声読み上げ：オフ'
    );
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggleBtn.addEventListener('click', () => {
      const nextEnabled = !this.speechPlayer.enabled;
      this.speechPlayer.setEnabled(nextEnabled);
      this.renderCurrentScene({ autoSpeak: false });
      if (nextEnabled && hasText) {
        this.speechPlayer.speak(scene.text, { speaker });
      }
    });
    controls.appendChild(toggleBtn);
    return controls;
  }

  /**
   * Render realistic smartphone SMS screen with interactive tappable clues.
   */
  renderSmsBlock(stage, scene) {
    const senderParsed = parseClueTokens(scene.sms_sender, 0);
    const bodyParsed = parseClueTokens(scene.sms_body, senderParsed.nextIndex);
    const sceneClueCount = bodyParsed.nextIndex;

    const phone = el('div', 'sms-phone-frame');
    const phoneTop = el('div', 'sms-phone-topbar');
    phoneTop.appendChild(el('span', 'sms-app-title', '💬 メッセージ（SMS）'));
    phoneTop.appendChild(el('span', 'sms-time', scene.sms_time || ''));
    phone.appendChild(phoneTop);

    // Sender row
    const senderBar = el('div', 'sms-sender-bar');
    senderBar.appendChild(el('span', 'sms-sender-label', '送り主：'));
    const senderContent = el('span', 'sms-sender-value');
    this.appendSegments(senderContent, senderParsed.segments, scene.scene_id);
    senderBar.appendChild(senderContent);
    phone.appendChild(senderBar);

    // Message bubble
    const bubble = el('div', 'sms-bubble');
    this.appendSegments(bubble, bodyParsed.segments, scene.scene_id);
    phone.appendChild(bubble);

    const helperNote = el(
      'p',
      'sms-tap-guide',
      `👆 点線で囲われた「怪しそうな部分」を指でタップしてみてください（この画面に ${sceneClueCount} 個のチェックポイントがあります）`
    );
    phone.appendChild(helperNote);

    stage.appendChild(phone);

    // Clue discovery feedback card
    const feedbackArea = el('div', 'clue-feedback-area');
    if (this.state.activeClueFeedback) {
      const fb = el('div', 'info-panel info-panel-teal clue-feedback-card');
      fb.appendChild(
        el('h3', 'panel-heading', `🔍 見つけました！「${this.state.activeClueFeedback.text}」`)
      );
      if (this.state.activeClueFeedback.gainedApple) {
        fb.appendChild(
          el(
            'div',
            'clue-apple-badge',
            `🍎 りんごを1つゲット！（現在 ${this.state.earnedAppleIds.size} / ${this.state.appleGoal} 個）`
          )
        );
      }
      fb.appendChild(el('p', 'panel-body', this.state.activeClueFeedback.explanation));
      feedbackArea.appendChild(fb);
    } else if (this.state.discoveredClues.size > 0) {
      const fb = el('div', 'info-panel info-panel-soft');
      fb.appendChild(
        el(
          'p',
          'panel-body',
          `現在 ${this.state.discoveredClues.size} 個見つけました！ほかの場所もタップしてみるか、下の「確認を終えて次へ進む」を押してください。`
        )
      );
      feedbackArea.appendChild(fb);
    }
    stage.appendChild(feedbackArea);

    // Hint toggle (matches DB-003 insight: explicit close label)
    if (scene.tip_body) {
      const hintWrap = el('div', 'hint-wrap');
      const hintToggleBtn = el(
        'button',
        'btn btn-amber-outline btn-medium',
        this.state.showHint ? '💡 ヒントを閉じる' : '💡 ヒントを見る'
      );
      hintToggleBtn.type = 'button';
      hintToggleBtn.addEventListener('click', () => {
        this.state.showHint = !this.state.showHint;
        this.renderCurrentScene();
      });
      hintWrap.appendChild(hintToggleBtn);

      if (this.state.showHint) {
        const hintCard = el('div', 'info-panel info-panel-amber hint-card');
        hintCard.appendChild(el('h3', 'panel-heading', scene.tip_title || '見つけるヒント'));
        hintCard.appendChild(el('p', 'panel-body', scene.tip_body));
        const closeHintBtn = el('button', 'btn btn-outline btn-small', 'ヒントを閉じる');
        closeHintBtn.type = 'button';
        closeHintBtn.addEventListener('click', () => {
          this.state.showHint = false;
          this.renderCurrentScene();
        });
        hintCard.appendChild(closeHintBtn);
        hintWrap.appendChild(hintCard);
      }

      stage.appendChild(hintWrap);
    }
  }

  /**
   * Render text + interactive clue buttons into parent element.
   */
  appendSegments(parent, segments, sceneId) {
    segments.forEach((seg) => {
      if (seg.type === 'text') {
        parent.appendChild(document.createTextNode(seg.text));
      } else {
        const clueKey = `${sceneId}::${seg.clueId}`;
        const isFound = this.state.discoveredClues.has(clueKey);
        const btn = el(
          'button',
          `sms-clue-btn ${isFound ? 'is-found' : ''}`,
          isFound ? `✓ ${seg.text}` : seg.text
        );
        btn.type = 'button';
        btn.setAttribute('aria-pressed', isFound ? 'true' : 'false');
        btn.addEventListener('click', () => {
          const isNewClue = !this.state.discoveredClues.has(clueKey);
          this.state.discoveredClues.add(clueKey);

          let gainedApple = false;
          if (isNewClue && this.state.isAppleMode) {
            const appleKey = `clue::${clueKey}`;
            if (!this.state.earnedAppleIds.has(appleKey)) {
              this.state.earnedAppleIds.add(appleKey);
              gainedApple = true;
              this.state.latestAppleGain = true;
              this.speechPlayer.playSfx('apple');
            }
          } else {
            this.state.latestAppleGain = false;
          }

          this.state.activeClueFeedback = {
            text: seg.text,
            explanation: seg.explanation,
            gainedApple,
          };
          this.renderCurrentScene();
        });
        parent.appendChild(btn);
      }
    });
  }

  /**
   * Render Episode 1 apple collection HUD bar.
   * @returns {HTMLElement}
   */
  renderAppleHud() {
    const earnedCount = this.state.earnedAppleIds.size;
    const goalCount = Math.max(1, this.state.appleGoal);
    const slotCount = Math.max(goalCount, earnedCount);

    const hud = el('div', 'apple-hud-bar');
    const top = el('div', 'apple-hud-top');
    top.appendChild(el('span', 'apple-hud-label', '🍎 集めたリンゴ'));
    top.appendChild(el('span', 'apple-hud-count', `${earnedCount} / ${goalCount} 個`));
    hud.appendChild(top);

    const slots = el('div', 'apple-slots');
    slots.setAttribute('role', 'img');
    slots.setAttribute('aria-label', `集めたリンゴ ${earnedCount}個 / 全${goalCount}個`);
    for (let i = 0; i < slotCount; i++) {
      const isEarned = i < earnedCount;
      const isNewest = this.state.latestAppleGain && i === earnedCount - 1;
      const slot = el(
        'span',
        `apple-slot ${isEarned ? 'is-earned' : 'is-empty'}${isNewest ? ' is-newly-earned' : ''}`,
        '🍎'
      );
      slot.setAttribute('aria-hidden', 'true');
      slots.appendChild(slot);
    }
    hud.appendChild(slots);
    hud.appendChild(
      el(
        'p',
        'apple-hud-note',
        '1つ正解するたびにリンゴを1つゲット！全問正解で黄金のリンゴ＆免許皆伝の巻物が授与されます。'
      )
    );

    return hud;
  }

  /**
   * Render up to 3 large choice buttons.
   */
  renderChoiceBlock(stage, scene) {
    const choiceList = el('div', 'choice-list');
    const choices = [];
    for (let idx = 1; idx <= 3; idx++) {
      const label = (scene[`choice${idx}_label`] || '').trim();
      const nextId = (scene[`choice${idx}_next`] || '').trim();
      const score = Number.parseInt(scene[`choice${idx}_score`] || '0', 10) || 0;
      if (!label || !nextId) continue;
      choices.push({ label, nextId, score });
    }

    const maxSceneChoiceScore = choices.reduce((max, item) => Math.max(max, item.score), 0);

    choices.forEach((choice) => {
      const btn = el('button', 'btn btn-choice btn-large', choice.label);
      btn.type = 'button';
      btn.addEventListener('click', () =>
        this.handleChoiceSelect(scene, { ...choice, maxSceneChoiceScore })
      );
      choiceList.appendChild(btn);
    });
    stage.appendChild(choiceList);
  }

  /**
   * Handle choice click: show praise/trap feedback overlay + audio, then proceed on button tap.
   * @param {Record<string, string>} scene
   * @param {{ label: string, nextId: string, score: number, maxSceneChoiceScore: number }} choice
   */
  handleChoiceSelect(scene, choice) {
    if (!this.state) return;
    if (choice.maxSceneChoiceScore <= 0) {
      this.advanceTo(choice.nextId, choice.score);
      return;
    }

    const isCorrect = choice.score > 0;
    const phrase = isCorrect
      ? this._pickPhrase(PRAISE_PHRASES, '_lastPraiseIdx')
      : this._pickPhrase(TRAP_PHRASES, '_lastTrapIdx');

    const appleKey = isCorrect && this.state.isAppleMode ? `choice::${scene.scene_id}` : null;
    const gainedApple = Boolean(appleKey && !this.state.earnedAppleIds.has(appleKey));
    const appleCount = this.state.earnedAppleIds.size + (gainedApple ? 1 : 0);

    this.state.activeChoiceFeedback = {
      isCorrect,
      phrase,
      nextId: choice.nextId,
      score: choice.score,
      appleKey,
      gainedApple,
      appleCount,
      appleGoal: this.state.appleGoal,
    };

    this.renderChoiceCalloutOverlay();

    if (isCorrect) {
      const speechMsg = gainedApple
        ? `${phrase.speech} りんごを1つゲットしました！`
        : phrase.speech;
      this.speechPlayer.speakFeedback(speechMsg, 'praise');
    } else {
      this.speechPlayer.speakFeedback(phrase.speech, 'trap');
    }
  }

  /**
   * Render dramatic praise/trap feedback modal over the active scene.
   */
  renderChoiceCalloutOverlay() {
    const fb = this.state?.activeChoiceFeedback;
    if (!fb) return;

    this.container.querySelectorAll('.choice-callout-overlay').forEach((node) => node.remove());

    const overlay = el('div', 'choice-callout-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'choice-callout-stamp');

    const card = el(
      'div',
      `choice-callout-card ${fb.isCorrect ? 'is-correct' : 'is-wrong'}`
    );

    card.appendChild(
      el('span', 'choice-callout-kicker', fb.isCorrect ? '✨ 大正解！ ✨' : '⚠️ ご注意！ ⚠️')
    );

    const stamp = el('h3', 'choice-callout-stamp', fb.phrase.display);
    stamp.id = 'choice-callout-stamp';
    card.appendChild(stamp);

    card.appendChild(el('p', 'choice-callout-sub', fb.phrase.sub));

    if (fb.gainedApple) {
      card.appendChild(
        el(
          'div',
          'choice-callout-apple-gain',
          `🍎 りんごを1つゲット！（現在 ${fb.appleCount} / ${fb.appleGoal} 個）`
        )
      );
    }

    const nextBtn = el(
      'button',
      `btn btn-large choice-callout-next ${fb.isCorrect ? 'btn-primary' : 'btn-secondary'}`,
      'つぎへ進む ▶'
    );
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
      overlay.remove();
      this.advanceTo(fb.nextId, fb.score, {
        appleKey: fb.appleKey,
        choiceOutcome: fb.isCorrect ? 'correct' : 'wrong',
      });
    });
    card.appendChild(nextBtn);

    overlay.appendChild(card);
    this.container.appendChild(overlay);
    nextBtn.focus({ preventScroll: true });
  }

  /**
   * Build the two-stage Perfect Clear showcase (Golden Apple transformation + Master Scroll award).
   * @param {{ episode: Record<string, string>, appleCount: number, discoveredCount: number, totalClues: number, autoSpeak: boolean }} opts
   * @returns {HTMLElement}
   */
  _createPerfectClearShowcase({ episode, appleCount, discoveredCount, totalClues, autoSpeak }) {
    const showcase = el('section', 'perfect-clear-showcase');
    showcase.setAttribute('aria-label', '全問正解の特別表彰');

    showcase.appendChild(
      el('div', 'perfect-clear-header', '🎊 全問正解！パーフェクトクリア！ 🎊')
    );

    const stagesGrid = el('div', 'perfect-clear-stages');

    // Stage 1: Red Apples -> Glittering Golden Apple
    const stage1 = el('div', 'perfect-stage-card golden-apple-stage');
    stage1.id = 'stage-golden-apple';
    stage1.appendChild(el('span', 'stage-badge', '✨ 第一段：黄金のリンゴ ✨'));

    const chamber = el('div', 'apple-transform-chamber');

    const cluster = el('div', 'red-apples-cluster');
    const row = el('div', 'red-apples-row');
    const displayApples = Math.max(1, appleCount);
    for (let i = 0; i < displayApples; i++) {
      const appleIcon = el('span', 'cluster-apple', '🍎');
      appleIcon.style.setProperty('--apple-idx', String(i));
      row.appendChild(appleIcon);
    }
    cluster.appendChild(row);
    cluster.appendChild(
      el('p', 'cluster-status', '集めたリンゴがキラキラと輝きだした…！')
    );
    chamber.appendChild(cluster);

    const emblem = el('div', 'golden-apple-emblem');
    const rays = el('div', 'golden-rays');
    rays.setAttribute('aria-hidden', 'true');
    emblem.appendChild(rays);

    const sparkleLayer = el('div', 'sparkle-layer');
    sparkleLayer.setAttribute('aria-hidden', 'true');
    ['✨', '★', '✨', '✦', '✨'].forEach((symbol, idx) => {
      sparkleLayer.appendChild(el('span', `sparkle sp-${idx + 1}`, symbol));
    });
    emblem.appendChild(sparkleLayer);
    emblem.appendChild(createGoldenAppleSvg());
    emblem.appendChild(el('span', 'golden-badge-tag', '✨ 黄金のリンゴ ✨'));
    chamber.appendChild(emblem);

    stage1.appendChild(chamber);
    stage1.appendChild(
      el(
        'p',
        'golden-apple-caption',
        this.state.isAppleMode
          ? `集めた ${displayApples} 個のリンゴが、まばゆく輝く『黄金のリンゴ』に変化しました！`
          : '全問正解の証『黄金のリンゴ』が誕生しました！'
      )
    );
    stagesGrid.appendChild(stage1);

    // Stage 2: Scroll of Mastery (免許皆伝の巻物)
    const stage2 = el('div', 'perfect-stage-card scroll-stage');
    stage2.id = 'stage-master-scroll';
    stage2.appendChild(el('span', 'stage-badge', '📜 第二段：免許皆伝の巻物（称号）'));

    const scroll = el('div', 'master-scroll');
    const createRoller = (pos) => {
      const roller = el('div', `scroll-roller scroll-roller-${pos}`);
      roller.appendChild(el('span', 'roller-cap'));
      roller.appendChild(el('span', 'roller-rod'));
      roller.appendChild(el('span', 'roller-cap'));
      return roller;
    };
    scroll.appendChild(createRoller('top'));

    const scrollBody = el('div', 'scroll-body');
    const scrollInner = el('div', 'scroll-inner');
    scrollInner.appendChild(el('div', 'scroll-hanko', '皆伝'));
    scrollInner.appendChild(el('p', 'scroll-kicker', '称号授与'));
    scrollInner.appendChild(el('h3', 'scroll-heading', '免許皆伝'));
    scrollInner.appendChild(
      el(
        'p',
        'scroll-title-ribbon',
        this.state.isAppleMode
          ? '「詐欺見抜き師・壱の巻」'
          : `「スマホ見守り達人・第${episode.episode_id}巻」`
      )
    );
    scrollInner.appendChild(
      el(
        'p',
        'scroll-inscription',
        `第${episode.episode_id}話「${episode.episode_title}」全問正解の証として、この巻物を授与する。`
      )
    );
    if (totalClues > 0 && discoveredCount >= totalClues) {
      scrollInner.appendChild(
        el('div', 'scroll-clue-seal', `★ 怪しいサイン完全発見（${totalClues}/${totalClues}）`)
      );
    }
    scrollBody.appendChild(scrollInner);
    scroll.appendChild(scrollBody);
    scroll.appendChild(createRoller('bottom'));
    stage2.appendChild(scroll);

    stagesGrid.appendChild(stage2);
    showcase.appendChild(stagesGrid);

    const runPerfectSequence = (playAudio) => {
      this.clearEffectTimers();
      stage1.classList.remove('is-transformed');
      stage2.classList.remove('is-unfurled');
      void showcase.offsetWidth;

      if (playAudio && this.speechPlayer.enabled) {
        this.speechPlayer.speakFeedback(
          'あっぱれ！全問正解です！集めたリンゴがキラキラと黄金のリンゴに変化し、免許皆伝の巻物が授与されました！',
          'fanfare'
        );
      }

      const t1 = setTimeout(() => {
        stage1.classList.add('is-transformed');
      }, 850);
      const t2 = setTimeout(() => {
        stage2.classList.add('is-unfurled');
      }, 1050);
      this._effectTimers.push(t1, t2);
    };

    const replayBtn = el(
      'button',
      'btn btn-secondary btn-medium perfect-replay-btn',
      '🔁 黄金のリンゴ＆巻物の演出をもういちど見る'
    );
    replayBtn.id = 'btn-replay-perfect-fx';
    replayBtn.type = 'button';
    replayBtn.addEventListener('click', () => runPerfectSequence(true));
    showcase.appendChild(replayBtn);

    runPerfectSequence(autoSpeak);
    return showcase;
  }

  /**
   * Render color-coded completion summary, score, learning tip, and official helplines.
   * @param {Record<string, string>} scene
   * @param {{ autoSpeak?: boolean }} [options]
   */
  renderResultScene(scene, { autoSpeak = false } = {}) {
    const { episode, discoveredClues, totalClues, actionScore, maxActionScore } = this.state;
    const evalResult = evaluateResultLevel(actionScore, maxActionScore);
    const isPerfectClear = this._isPerfectClear();
    const appleCount = this.state.earnedAppleIds.size;
    const card = el('section', `card novel-result-card result-level-${evalResult.level}`);

    card.appendChild(el('div', 'result-verdict-badge', evalResult.badge));

    const verdictBanner = el('div', 'result-verdict-banner');
    verdictBanner.appendChild(el('p', 'result-verdict-text', evalResult.summary));
    card.appendChild(verdictBanner);

    card.appendChild(el('h2', 'result-title', `第${episode.episode_id}話「${episode.episode_title}」結果`));

    if (isPerfectClear) {
      card.appendChild(
        this._createPerfectClearShowcase({
          episode,
          appleCount,
          discoveredCount: discoveredClues.size,
          totalClues,
          autoSpeak,
        })
      );
    } else if (this.state.isAppleMode) {
      const appleBox = el('div', 'apple-result-summary');
      appleBox.appendChild(
        el(
          'p',
          'apple-result-count',
          `🍎 今回集めたリンゴ：${appleCount} / ${this.state.appleGoal} 個`
        )
      );
      appleBox.appendChild(
        el(
          'p',
          'apple-result-hint',
          '全問正解すると、集めたリンゴがキラキラと『黄金のリンゴ』に変化して『免許皆伝の巻物（称号）』が授与されます！ぜひもう一度挑戦してみましょう。'
        )
      );
      card.appendChild(appleBox);
    }

    const resultImageUrl = resolveSceneImage(this.state.scenarioDir, scene.image);
    if (resultImageUrl) {
      card.appendChild(
        createSceneImageFigure(
          resultImageUrl,
          `第${episode.episode_id}話「${episode.episode_title}」の結果イラスト`
        )
      );
    }

    if (this.speechPlayer.isSupported()) {
      const controlsRow = el('div', 'novel-speaker-row');
      controlsRow.appendChild(this._createSpeechControls(scene));
      card.appendChild(controlsRow);
    }

    card.appendChild(el('p', 'novel-text', scene.text));

    // Separate psychological safety declaration so red danger warning never implies real harm happened
    const safeBox = el('div', 'safety-assurance-banner');
    safeBox.appendChild(
      el(
        'p',
        'safety-assurance-text',
        '🛡️ ここは練習用の安全な画面ですので、実際にお金が請求されたりスマートフォンが壊れたりすることは絶対にありません！'
      )
    );
    card.appendChild(safeBox);

    // Score summary grid
    const scoreGrid = el('div', 'result-score-grid');
    if (totalClues > 0) {
      const clueEval = evaluateClueLevel(discoveredClues.size, totalClues);
      const clueMetric = el('div', `score-metric-box is-${clueEval.level}`);
      clueMetric.appendChild(el('span', 'metric-label', '見つけた怪しいサイン'));
      clueMetric.appendChild(
        el('strong', 'metric-value', `${discoveredClues.size} / ${totalClues} 個`)
      );
      if (clueEval.note) {
        clueMetric.appendChild(el('span', 'metric-note', clueEval.note));
      }
      scoreGrid.appendChild(clueMetric);
    }

    const actionMetric = el('div', `score-metric-box is-${evalResult.level}`);
    actionMetric.appendChild(el('span', 'metric-label', '安全行動スコア'));
    const scoreDisplay = maxActionScore > 0 ? `${actionScore} / ${maxActionScore} 点` : `${actionScore} 点`;
    actionMetric.appendChild(el('strong', 'metric-value', scoreDisplay));
    scoreGrid.appendChild(actionMetric);

    if (this.state.isAppleMode) {
      const appleMetric = el(
        'div',
        `score-metric-box ${isPerfectClear ? 'is-golden' : 'is-caution'}`
      );
      appleMetric.appendChild(el('span', 'metric-label', '集めたリンゴ'));
      appleMetric.appendChild(
        el(
          'strong',
          'metric-value',
          isPerfectClear ? '✨ 黄金のリンゴ' : `${appleCount} / ${this.state.appleGoal} 個`
        )
      );
      appleMetric.appendChild(
        el(
          'span',
          'metric-note',
          isPerfectClear
            ? `${Math.max(1, appleCount)}個が黄金に昇華・免許皆伝！`
            : '全問正解で黄金のリンゴに変化'
        )
      );
      scoreGrid.appendChild(appleMetric);
    }

    card.appendChild(scoreGrid);

    // Key takeaway tip
    if (scene.tip_title || scene.tip_body) {
      const tipBox = el('div', 'info-panel info-panel-teal');
      tipBox.appendChild(el('h3', 'panel-heading', `📌 ${scene.tip_title || '覚えておきたい行動ルール'}`));
      tipBox.appendChild(el('p', 'panel-body', scene.tip_body));
      card.appendChild(tipBox);
    }

    // Official consultation contacts
    const helpBox = el('div', 'info-panel info-panel-amber');
    helpBox.appendChild(el('h3', 'panel-heading', '📞 困ったとき・迷ったときの公的相談窓口'));
    const list = el('ul', 'helpline-list');
    const li1 = el('li');
    li1.appendChild(el('strong', 'helpline-num', '#9110'));
    li1.appendChild(
      document.createTextNode('（警察相談専用電話：詐欺かな？と迷ったときの相談窓口）')
    );
    const li2 = el('li');
    li2.appendChild(el('strong', 'helpline-num', '188'));
    li2.appendChild(
      document.createTextNode('（消費者ホットライン「いやや！」：お近くの消費生活センターにつながります）')
    );
    list.appendChild(li1);
    list.appendChild(li2);
    helpBox.appendChild(list);
    card.appendChild(helpBox);

    // Result action buttons
    const actions = el('div', 'action-stack');
    const retryBtn = el('button', 'btn btn-secondary btn-large', '🔄 もう一度このお話を体験する');
    retryBtn.type = 'button';
    retryBtn.addEventListener('click', () =>
      this.startEpisode(episode, episode.status === 'dummy')
    );

    const listBtn = el('button', 'btn btn-primary btn-large', '📖 お話一覧へもどる');
    listBtn.type = 'button';
    listBtn.addEventListener('click', () => this.callbacks.onNavigateEpisodes());

    const dbBtn = el('button', 'btn btn-outline btn-large', '💬 みんなのつまずきDBを見る');
    dbBtn.type = 'button';
    dbBtn.addEventListener('click', () => this.callbacks.onNavigateDb());

    actions.appendChild(retryBtn);
    actions.appendChild(listBtn);
    actions.appendChild(dbBtn);
    card.appendChild(actions);

    this.container.appendChild(card);
  }
}
