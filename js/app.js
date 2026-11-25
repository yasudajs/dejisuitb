import { loadCSV } from './csvParser.js';
import { NovelEngine } from './novelEngine.js';
import { KnowledgeDbView } from './knowledgeDb.js';

const appState = {
  episodes: [],
  knowledgeRecords: [],
  currentView: 'title',
  viewHistory: [],
};

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
 * @param {'title'|'home'|'episodes'|'novel'|'db'} nextView
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
  } else if (appState.currentView === 'home') {
    navigateTo('title', false);
  } else if (appState.currentView !== 'title') {
    navigateTo('home', false);
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
  intro.appendChild(el('h2', 'section-title', 'ストーリー体験（全15話）'));
  intro.appendChild(
    el(
      'p',
      'lead-text',
      'まずは「第1話」から体験できます。第2話以降は、1話ごとに分かれたCSVファイルへ順番にお話を追加できる仕組みになっています。'
    )
  );
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

      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });
}

/**
 * Update Home dashboard numbers from loaded CSVs.
 */
function updateHomeCounters() {
  const playableCount = appState.episodes.filter((e) => e.status === 'playable').length;
  const totalEpCount = appState.episodes.length;
  const dbCount = appState.knowledgeRecords.length;

  if (elements.homeEpCount) {
    elements.homeEpCount.textContent = `全${totalEpCount}話（第1話 公開中 / 他${Math.max(
      0,
      totalEpCount - playableCount
    )}話 準備中）`;
  }
  if (elements.homeDbCount) {
    elements.homeDbCount.textContent = `4レイヤー・ダミー記録 ${dbCount}件`;
  }
}

async function initApp() {
  elements.globalHomeBtn = document.getElementById('global-home-btn');
  elements.globalBackBtn = document.getElementById('global-back-btn');
  elements.episodesContainer = document.getElementById('view-episodes');
  elements.novelContainer = document.getElementById('view-novel');
  elements.dbContainer = document.getElementById('view-db');
  elements.homeStatus = document.getElementById('home-load-status');
  elements.homeEpCount = document.getElementById('home-ep-count');
  elements.homeDbCount = document.getElementById('home-db-count');

  // Wire persistent header navigation
  elements.globalHomeBtn.addEventListener('click', () => {
    appState.viewHistory = ['title'];
    navigateTo('home', false);
  });
  elements.globalBackBtn.addEventListener('click', handleGlobalBack);

  // Wire title cover screen entry buttons
  const startFromTitle = () => {
    navigateTo('home', true);
  };
  document.getElementById('btn-title-start')?.addEventListener('click', startFromTitle);
  document.getElementById('btn-title-start-sub')?.addEventListener('click', startFromTitle);

  // Wire home entry buttons
  document.getElementById('btn-open-episodes').addEventListener('click', () => {
    navigateTo('episodes');
  });
  document.getElementById('btn-open-ep1-direct').addEventListener('click', () => {
    const ep1 = appState.episodes.find((e) => e.episode_id === '1') || appState.episodes[0];
    if (ep1) {
      navigateTo('novel');
      novelEngine.startEpisode(ep1);
    } else {
      navigateTo('episodes');
    }
  });
  document.getElementById('btn-open-db').addEventListener('click', () => {
    navigateTo('db');
  });

  // Initialize views
  novelEngine = new NovelEngine(elements.novelContainer, {
    onNavigateEpisodes: () => navigateTo('episodes'),
    onNavigateDb: () => navigateTo('db'),
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

    updateHomeCounters();
    renderEpisodesList();
    knowledgeDbView.setRecords(knowledgeRecords);

    if (elements.homeStatus) {
      elements.homeStatus.hidden = true;
    }
  } catch (err) {
    if (elements.homeStatus) {
      elements.homeStatus.hidden = false;
      elements.homeStatus.className = 'card info-panel info-panel-amber';
      elements.homeStatus.innerHTML = '';
      elements.homeStatus.appendChild(
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
