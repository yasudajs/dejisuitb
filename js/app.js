import { loadCSV } from './csvParser.js';
import { NovelEngine } from './novelEngine.js';
import { KnowledgeDbView } from './knowledgeDb.js';

const PROGRESS_STORAGE_KEY = 'moshimo_episode_achievements_v1';

const ACHIEVEMENT_BADGE_BY_LEVEL = {
  good: {
    barClass: 'is-good',
    pillClass: 'achievement-pill-good',
    label: '✅ 安全クリア',
  },
  caution: {
    barClass: 'is-caution',
    pillClass: 'achievement-pill-caution',
    label: '⚠️ もう一歩（途中回避）',
  },
  bad: {
    barClass: 'is-bad',
    pillClass: 'achievement-pill-bad',
    label: '🚨 危険ルート（もう一度挑戦）',
  },
  neutral: {
    barClass: 'is-neutral',
    pillClass: 'achievement-pill-neutral',
    label: '📖 体験済み',
  },
};

const appState = {
  episodes: [],
  knowledgeRecords: [],
  achievements: {},
  currentView: 'title',
  viewHistory: [],
};

function loadAchievements() {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveEpisodeAchievement(summary) {
  const episodeId = String(summary?.episodeId || '').trim();
  if (!episodeId) return;

  const next = {
    cleared: Boolean(summary.cleared),
    bestApples: summary.apples || 0,
    appleGoal: summary.appleGoal || 0,
    perfect: Boolean(summary.perfect),
    bestLevel: summary.resultLevel || 'neutral',
  };

  appState.achievements[episodeId] = next;
  try {
    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify(appState.achievements)
    );
  } catch {
    // Ignore storage quota or private browsing errors
  }
  renderEpisodesList();
}

const elements = {};
let novelEngine = null;
let knowledgeDbView = null;

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

/**
 * Switch active view and record navigation history.
 * @param {'title'|'episodes'|'novel'|'db'} nextView
 * @param {boolean} pushHistory
 */
function navigateTo(nextView, pushHistory = true) {
  if (nextView !== 'novel') {
    novelEngine?.stopSpeech();
  }

  if (nextView === 'title') {
    appState.viewHistory = [];
  } else if (pushHistory && appState.currentView && appState.currentView !== nextView) {
    appState.viewHistory.push(appState.currentView);
  }
  appState.currentView = nextView;

  document.querySelectorAll('.app-view').forEach((section) => {
    section.hidden = section.id !== `view-${nextView}`;
  });

  document.body.classList.toggle('is-title-view', nextView === 'title');

  // Update persistent back button availability
  if (elements.globalBackBtn) {
    const canGoBack = appState.viewHistory.length > 0 || nextView !== 'title';
    elements.globalBackBtn.disabled = !canGoBack;
    elements.globalBackBtn.setAttribute('aria-disabled', String(!canGoBack));
  }

  window.scrollTo({ top: 0, behavior: nextView === 'title' ? 'auto' : 'smooth' });
}

/**
 * Persistent "ひとつ戻る" handler.
 */
function handleGlobalBack() {
  if (appState.viewHistory.length > 0) {
    const prev = appState.viewHistory.pop();
    navigateTo(prev, false);
  } else if (appState.currentView !== 'title') {
    navigateTo('title', false);
  }
}

/**
 * Render Episode List grouped by Series A and Series B.
 */
function renderEpisodesList() {
  const container = elements.episodesContainer;
  if (!container) return;
  container.innerHTML = '';

  const intro = el('section', 'card episodes-intro');
  const safetyBanner = el('div', 'safety-assurance-banner');
  safetyBanner.appendChild(
    el(
      'p',
      'safety-assurance-text',
      '🛡️ ボタンを押し間違えても、この中の操作でスマートフォンが壊れることは絶対にありません。安心してゆっくりお試しください。'
    )
  );
  intro.appendChild(safetyBanner);
  intro.appendChild(el('h2', 'section-title', 'ストーリー体験（全15話）'));

  container.appendChild(intro);

  const seriesGroups = [
    {
      prefix: 'A',
      heading: 'シリーズA：日常防御・スマホ謎解きシナリオ（第1〜10話）',
      desc: 'SMSや通知画面から違和感を見抜く日常の練習です。',
    },
    {
      prefix: 'B',
      heading: 'シリーズB：心理的盲点・通話介入シナリオ（第11〜15話）',
      desc: '家族への思いやりや不安につけ込む手口に備えます。',
    },
  ];

  seriesGroups.forEach((group) => {
    const groupEpisodes = appState.episodes.filter((ep) =>
      (ep.series || '').startsWith(group.prefix)
    );
    if (!groupEpisodes.length) return;

    const section = el('section', 'series-section');
    const headingBox = el('div', 'series-heading-box');
    headingBox.appendChild(el('h3', 'series-heading', group.heading));
    headingBox.appendChild(el('p', 'series-desc', group.desc));
    section.appendChild(headingBox);

    const grid = el('div', 'episodes-grid');
    groupEpisodes.forEach((ep) => {
      const isPlayable = ep.status === 'playable';
      const card = el(
        'article',
        `card episode-card ${isPlayable ? 'is-playable' : 'is-dummy'}`
      );

      const topRow = el('div', 'episode-card-top');
      topRow.appendChild(el('span', 'episode-num', `第${ep.episode_id}話`));
      topRow.appendChild(el('span', 'badge badge-category', ep.category));
      topRow.appendChild(
        el(
          'span',
          `badge ${isPlayable ? 'badge-playable' : 'badge-dummy'}`,
          isPlayable ? '公開中' : '準備中'
        )
      );
      card.appendChild(topRow);

      card.appendChild(el('h4', 'episode-card-title', ep.episode_title));
      card.appendChild(el('p', 'episode-card-summary', ep.summary));

      const btn = el(
        'button',
        `btn btn-large ${isPlayable ? 'btn-primary' : 'btn-outline'}`,
        isPlayable ? '▶ 第1話を体験する' : '概要を見る（準備中）'
      );
      btn.type = 'button';
      btn.addEventListener('click', () => {
        navigateTo('novel');
        novelEngine.startEpisode(ep);
      });
      card.appendChild(btn);

      const ach = appState.achievements[String(ep.episode_id || '').trim()];
      if (ach && ach.cleared) {
        if (ach.perfect) {
          const achBar = el('div', 'episode-achievement-bar is-perfect');
          achBar.appendChild(
            el('span', 'achievement-pill achievement-pill-gold', '✨🍎 黄金のリンゴ')
          );
          achBar.appendChild(
            el('span', 'achievement-pill achievement-pill-scroll', '📜 免許皆伝')
          );
          card.appendChild(achBar);
        } else {
          const levelMeta =
            ACHIEVEMENT_BADGE_BY_LEVEL[ach.bestLevel] ||
            ACHIEVEMENT_BADGE_BY_LEVEL.neutral;
          const achBar = el('div', `episode-achievement-bar ${levelMeta.barClass}`);
          achBar.appendChild(
            el('span', `achievement-pill ${levelMeta.pillClass}`, levelMeta.label)
          );
          if (ach.bestApples > 0) {
            const appleIcons = '🍎'.repeat(ach.bestApples);
            const appleLabel =
              ach.appleGoal > 0
                ? `${appleIcons}（${ach.bestApples}/${ach.appleGoal}）`
                : appleIcons;
            achBar.appendChild(
              el('span', 'achievement-pill achievement-pill-apple', appleLabel)
            );
          }
          card.appendChild(achBar);
        }
      }

      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });

  const rulesCard = el('section', 'card home-rule-card');
  rulesCard.appendChild(el('h3', 'panel-heading', '覚えておきたい「3つの合言葉」'));
  const rulesGrid = el('div', 'three-rules-grid');
  const threeRules = [
    {
      num: '1',
      title: '疑う',
      desc: '「急いで！」「今日中！」と急かされたら一度ストップ',
    },
    {
      num: '2',
      title: '確かめる',
      desc: '届いたURLは押さず、公式アプリや裏面の電話番号から確認',
    },
    {
      num: '3',
      title: '相談する',
      desc: '迷ったら家族や #9110・188 へ相談（聞けたら大正解！）',
    },
  ];
  threeRules.forEach((rule) => {
    const chip = el('div', 'rule-chip');
    chip.appendChild(el('span', 'rule-num', rule.num));
    const textBox = el('div');
    textBox.appendChild(el('strong', '', rule.title));
    textBox.appendChild(el('p', '', rule.desc));
    chip.appendChild(textBox);
    rulesGrid.appendChild(chip);
  });
  rulesCard.appendChild(rulesGrid);
  container.appendChild(rulesCard);
}

async function initApp() {
  appState.achievements = loadAchievements();
  elements.headerBrandBtn = document.getElementById('header-brand-btn');
  elements.globalHomeBtn = document.getElementById('global-home-btn');
  elements.globalBackBtn = document.getElementById('global-back-btn');
  elements.episodesContainer = document.getElementById('view-episodes');
  elements.novelContainer = document.getElementById('view-novel');
  elements.dbContainer = document.getElementById('view-db');
  elements.loadStatus = document.getElementById('app-load-status');

  const goToTitle = () => {
    appState.viewHistory = [];
    navigateTo('title', false);
  };

  // Wire persistent header navigation
  elements.headerBrandBtn?.addEventListener('click', goToTitle);
  elements.globalHomeBtn?.addEventListener('click', goToTitle);
  elements.globalBackBtn?.addEventListener('click', handleGlobalBack);

  // Wire title cover screen entry buttons
  const startFromTitle = () => {
    navigateTo('episodes', true);
  };
  document.getElementById('btn-title-start')?.addEventListener('click', startFromTitle);
  document.getElementById('btn-title-start-sub')?.addEventListener('click', startFromTitle);
  document.getElementById('btn-title-db')?.addEventListener('click', () => {
    navigateTo('db', true);
  });

  // Initialize views
  novelEngine = new NovelEngine(elements.novelContainer, {
    onNavigateEpisodes: () => navigateTo('episodes'),
    onNavigateDb: () => navigateTo('db'),
    onEpisodeComplete: (summary) => saveEpisodeAchievement(summary),
  });
  knowledgeDbView = new KnowledgeDbView(elements.dbContainer);

  navigateTo('title', false);

  try {
    const [episodes, knowledgeRecords] = await Promise.all([
      loadCSV('./data/episodes.csv'),
      loadCSV('./data/knowledge_db.csv'),
    ]);

    appState.episodes = episodes;
    appState.knowledgeRecords = knowledgeRecords;

    renderEpisodesList();
    knowledgeDbView.setRecords(knowledgeRecords);

    if (elements.loadStatus) {
      elements.loadStatus.hidden = true;
    }
  } catch (err) {
    if (elements.loadStatus) {
      elements.loadStatus.hidden = false;
      elements.loadStatus.className = 'card info-panel info-panel-amber';
      elements.loadStatus.innerHTML = '';
      elements.loadStatus.appendChild(
        el(
          'p',
          'panel-body',
          `データの読み込みで問題が起きました。ローカルで確認する場合は「python -m http.server」などのWebサーバー経由で開いてください。（詳細: ${err.message}）`
        )
      );
    }
  }

  window.addEventListener('pagehide', () => novelEngine?.stopSpeech());
  window.addEventListener('beforeunload', () => novelEngine?.stopSpeech());
}

document.addEventListener('DOMContentLoaded', initApp);
