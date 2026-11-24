import { loadCSV } from './csvParser.js';

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
  }

  /**
   * Start an episode (playable or dummy preview).
   * @param {Record<string, string>} episode
   * @param {boolean} forcePlayDummy
   */
  async startEpisode(episode, forcePlayDummy = false) {
    this.container.innerHTML = '';
    const loadingBox = el('div', 'card state-box', 'お話を読み込んでいます…');
    this.container.appendChild(loadingBox);

    if (episode.status === 'dummy' && !forcePlayDummy) {
      this.renderDummyPreview(episode);
      return;
    }

    try {
      const cleanPath = (episode.scenario_file || '').trim().replace(/^\.?\//, '');
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

      this.state = {
        episode,
        scenes,
        sceneMap,
        sceneOrder,
        currentSceneId: scenes[0].scene_id.trim(),
        history: [],
        actionScore: 0,
        discoveredClues: new Set(),
        totalClues,
        activeClueFeedback: null,
        showHint: false,
      };

      this.renderCurrentScene();
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

    const noticeBox = el('div', 'info-panel info-panel-amber');
    noticeBox.appendChild(el('h3', 'panel-heading', '制作・編集担当者の方へ'));
    noticeBox.appendChild(
      el(
        'p',
        'panel-body',
        `第2話以降は順次作成中です。担当者は「${episode.scenario_file}」を編集し、「data/episodes.csv」の status を playable に変更すると本編として公開できます。`
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
   */
  advanceTo(nextSceneId, scoreDelta = 0) {
    if (!this.state) return;
    const targetId = (nextSceneId || '').trim();
    if (!targetId || !this.state.sceneMap.has(targetId)) {
      return;
    }

    this.state.history.push({
      sceneId: this.state.currentSceneId,
      actionScore: this.state.actionScore,
      discoveredClues: new Set(this.state.discoveredClues),
    });

    this.state.actionScore += scoreDelta;
    this.state.currentSceneId = targetId;
    this.state.activeClueFeedback = null;
    this.state.showHint = false;

    this.renderCurrentScene();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Step back to previous scene inside the sound novel.
   */
  stepBack() {
    if (!this.state || this.state.history.length === 0) return;
    const prev = this.state.history.pop();
    this.state.currentSceneId = prev.sceneId;
    this.state.actionScore = prev.actionScore;
    this.state.discoveredClues = prev.discoveredClues;
    this.state.activeClueFeedback = null;
    this.state.showHint = false;
    this.renderCurrentScene();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Render the active scene card.
   */
  renderCurrentScene() {
    if (!this.state) return;
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

    this.container.appendChild(header);

    // Scene body by scene_type
    if (scene.scene_type === 'result') {
      this.renderResultScene(scene);
      return;
    }

    const stage = el('section', 'card novel-stage');

    // Speaker badge
    const speaker = (scene.speaker || '').trim();
    if (speaker) {
      let speakerClass = 'speaker-badge';
      if (speaker.includes('あなた')) speakerClass += ' speaker-you';
      else if (speaker.includes('娘') || speaker.includes('家族')) speakerClass += ' speaker-family';
      else if (speaker.includes('案内')) speakerClass += ' speaker-guide';
      else speakerClass += ' speaker-narration';
      stage.appendChild(el('div', speakerClass, speaker));
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
          this.state.discoveredClues.add(clueKey);
          this.state.activeClueFeedback = {
            text: seg.text,
            explanation: seg.explanation,
          };
          this.renderCurrentScene();
        });
        parent.appendChild(btn);
      }
    });
  }

  /**
   * Render up to 3 large choice buttons.
   */
  renderChoiceBlock(stage, scene) {
    const choiceList = el('div', 'choice-list');
    for (let idx = 1; idx <= 3; idx++) {
      const label = (scene[`choice${idx}_label`] || '').trim();
      const nextId = (scene[`choice${idx}_next`] || '').trim();
      const score = Number.parseInt(scene[`choice${idx}_score`] || '0', 10) || 0;
      if (!label || !nextId) continue;

      const btn = el('button', 'btn btn-choice btn-large', label);
      btn.type = 'button';
      btn.addEventListener('click', () => this.advanceTo(nextId, score));
      choiceList.appendChild(btn);
    }
    stage.appendChild(choiceList);
  }

  /**
   * Render affirming completion summary, score, learning tip, and official helplines.
   */
  renderResultScene(scene) {
    const { episode, discoveredClues, totalClues, actionScore } = this.state;
    const card = el('section', 'card novel-result-card');

    card.appendChild(el('div', 'result-celebrate-badge', '✨ 体験おつかれさまでした！'));
    card.appendChild(el('h2', 'result-title', `第${episode.episode_id}話「${episode.episode_title}」完了`));
    card.appendChild(el('p', 'novel-text', scene.text));

    // Psychological safety declaration
    const safeBox = el('div', 'safety-assurance-banner');
    safeBox.appendChild(
      el(
        'p',
        'safety-assurance-text',
        '🛡️ 練習のなかで何を試しても大丈夫です。スマートフォンは絶対に壊れません！'
      )
    );
    card.appendChild(safeBox);

    // Score summary grid
    const scoreGrid = el('div', 'result-score-grid');
    if (totalClues > 0) {
      const clueMetric = el('div', 'score-metric-box');
      clueMetric.appendChild(el('span', 'metric-label', '見つけた怪しいサイン'));
      clueMetric.appendChild(
        el('strong', 'metric-value', `${discoveredClues.size} / ${totalClues} 個`)
      );
      scoreGrid.appendChild(clueMetric);
    }

    const actionMetric = el('div', 'score-metric-box');
    actionMetric.appendChild(el('span', 'metric-label', '安全行動スコア'));
    actionMetric.appendChild(el('strong', 'metric-value', `${actionScore} 点`));
    scoreGrid.appendChild(actionMetric);
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
