/**
 * Pillar 2: 三現主義（現場・現物・現実）ナレッジデータベース View
 */

const LAYER_CONFIG = [
  {
    key: '操作・UI上の躓き',
    label: '操作・UI上の躓き',
    shortDesc: 'ボタン位置や文字サイズ・音声入力の待機など操作面の事実',
    colorClass: 'layer-ui',
  },
  {
    key: '心理的・感情的抵抗',
    label: '心理的・感情的抵抗',
    shortDesc: '「壊れたら怖い」「相談すると迷惑かも」という心の障壁',
    colorClass: 'layer-psych',
  },
  {
    key: 'トラブル・詐欺遭遇リスク',
    label: 'トラブル・詐欺遭遇リスク',
    shortDesc: '実際の詐欺手口や誤認しやすい表現・遭遇状況',
    colorClass: 'layer-risk',
  },
  {
    key: '生活関心・回想',
    label: '生活関心・回想',
    shortDesc: '趣味・暮らしの知恵・会話が弾む前向きなトピック',
    colorClass: 'layer-life',
  },
];

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

export class KnowledgeDbView {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.records = [];
    this.selectedLayer = 'ALL';
    this.selectedEpisode = 'ALL';
    this.searchKeyword = '';
  }

  /**
   * Set loaded CSV records and render.
   * @param {Array<Record<string, string>>} records
   */
  setRecords(records) {
    this.records = records || [];
    this.render();
  }

  /**
   * Filter records according to current UI controls.
   */
  getFilteredRecords() {
    const kw = this.searchKeyword.trim().toLowerCase();
    return this.records.filter((rec) => {
      if (this.selectedLayer !== 'ALL' && rec.layer !== this.selectedLayer) {
        return false;
      }
      if (this.selectedEpisode !== 'ALL' && rec.episode_ref !== this.selectedEpisode) {
        return false;
      }
      if (kw) {
        const haystack = [
          rec.situation,
          rec.user_voice,
          rec.insight,
          rec.supporter_ok_phrase,
          rec.episode_ref,
          rec.age_group,
          rec.layer,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }

  render() {
    this.container.innerHTML = '';

    // Intro Card
    const intro = el('section', 'card db-intro-card');
    intro.appendChild(el('h2', 'section-title', '三現主義ナレッジデータベース（柱②）'));
    intro.appendChild(
      el(
        'p',
        'lead-text',
        'アンケートではなく、「現場・現物・現実」から集まった利用者のリアルなつまずきや声かけの知恵をまとめたデータベースです（現在はダミーCSVデータを表示しています）。'
      )
    );
    this.container.appendChild(intro);

    // 4-Layer Summary & CSS Bar Chart
    const summarySection = el('section', 'card db-summary-card');
    const summaryHead = el('div', 'db-summary-head');
    summaryHead.appendChild(el('h3', 'panel-heading', '4レイヤー別の集計状況'));
    summaryHead.appendChild(
      el('span', 'db-total-pill', `登録データ全 ${this.records.length} 件`)
    );
    summarySection.appendChild(summaryHead);

    const chartGrid = el('div', 'db-chart-grid');
    const total = Math.max(1, this.records.length);

    LAYER_CONFIG.forEach((cfg) => {
      const count = this.records.filter((r) => r.layer === cfg.key).length;
      const pct = Math.round((count / total) * 100);
      const isSelected = this.selectedLayer === cfg.key;

      const rowBtn = el(
        'button',
        `db-layer-stat ${cfg.colorClass} ${isSelected ? 'is-selected' : ''}`
      );
      rowBtn.type = 'button';
      rowBtn.addEventListener('click', () => {
        this.selectedLayer = this.selectedLayer === cfg.key ? 'ALL' : cfg.key;
        this.render();
      });

      const topLine = el('div', 'db-stat-top');
      topLine.appendChild(el('span', 'db-stat-name', cfg.label));
      topLine.appendChild(el('span', 'db-stat-count', `${count}件（${pct}%）`));
      rowBtn.appendChild(topLine);

      const barTrack = el('div', 'db-bar-track');
      const barFill = el('div', `db-bar-fill ${cfg.colorClass}`);
      barFill.style.width = `${pct}%`;
      barTrack.appendChild(barFill);
      rowBtn.appendChild(barTrack);

      rowBtn.appendChild(el('p', 'db-stat-desc', cfg.shortDesc));
      chartGrid.appendChild(rowBtn);
    });

    summarySection.appendChild(chartGrid);
    this.container.appendChild(summarySection);

    // Filter & Search Controls
    const filterSection = el('section', 'card db-filter-card');
    filterSection.appendChild(el('h3', 'panel-heading', '絞り込み・キーワード検索'));

    // Layer pills
    const pillRow = el('div', 'filter-pill-row');
    const allPill = el(
      'button',
      `filter-pill ${this.selectedLayer === 'ALL' ? 'is-active' : ''}`,
      'すべて'
    );
    allPill.type = 'button';
    allPill.addEventListener('click', () => {
      this.selectedLayer = 'ALL';
      this.render();
    });
    pillRow.appendChild(allPill);

    LAYER_CONFIG.forEach((cfg) => {
      const pill = el(
        'button',
        `filter-pill ${this.selectedLayer === cfg.key ? 'is-active' : ''}`,
        cfg.label
      );
      pill.type = 'button';
      pill.addEventListener('click', () => {
        this.selectedLayer = cfg.key;
        this.render();
      });
      pillRow.appendChild(pill);
    });
    filterSection.appendChild(pillRow);

    // Search + Episode Select row
    const controlRow = el('div', 'filter-control-row');

    const searchWrap = el('div', 'control-group');
    const searchLabel = el('label', 'control-label', 'キーワードで探す');
    searchLabel.setAttribute('for', 'db-search-input');
    const searchInput = document.createElement('input');
    searchInput.id = 'db-search-input';
    searchInput.type = 'search';
    searchInput.className = 'text-input';
    searchInput.placeholder = '例：ボタン、リンゴ、+44、不安 など';
    searchInput.value = this.searchKeyword;
    searchInput.addEventListener('input', (e) => {
      this.searchKeyword = e.target.value;
      this.renderCardsOnly(cardsContainer, resultCountEl);
    });
    searchWrap.appendChild(searchLabel);
    searchWrap.appendChild(searchInput);
    controlRow.appendChild(searchWrap);

    const epWrap = el('div', 'control-group');
    const epLabel = el('label', 'control-label', '関連する話数・場面');
    epLabel.setAttribute('for', 'db-episode-select');
    const epSelect = document.createElement('select');
    epSelect.id = 'db-episode-select';
    epSelect.className = 'select-input';

    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.textContent = 'すべての場面';
    epSelect.appendChild(optAll);

    const uniqueEpisodes = Array.from(
      new Set(this.records.map((r) => r.episode_ref).filter(Boolean))
    );
    uniqueEpisodes.forEach((epRef) => {
      const opt = document.createElement('option');
      opt.value = epRef;
      opt.textContent = epRef;
      if (this.selectedEpisode === epRef) opt.selected = true;
      epSelect.appendChild(opt);
    });
    epSelect.addEventListener('change', (e) => {
      this.selectedEpisode = e.target.value;
      this.renderCardsOnly(cardsContainer, resultCountEl);
    });
    epWrap.appendChild(epLabel);
    epWrap.appendChild(epSelect);
    controlRow.appendChild(epWrap);

    filterSection.appendChild(controlRow);

    const statusBar = el('div', 'db-status-bar');
    const resultCountEl = el('p', 'db-result-count');
    statusBar.appendChild(resultCountEl);

    if (
      this.selectedLayer !== 'ALL' ||
      this.selectedEpisode !== 'ALL' ||
      this.searchKeyword.trim() !== ''
    ) {
      const resetBtn = el('button', 'btn btn-outline btn-small', '条件をリセット');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', () => {
        this.selectedLayer = 'ALL';
        this.selectedEpisode = 'ALL';
        this.searchKeyword = '';
        this.render();
      });
      statusBar.appendChild(resetBtn);
    }

    filterSection.appendChild(statusBar);
    this.container.appendChild(filterSection);

    // Results list container
    const cardsContainer = el('div', 'db-cards-list');
    this.container.appendChild(cardsContainer);

    this.renderCardsOnly(cardsContainer, resultCountEl);
  }

  /**
   * Re-render only the cards and result count without losing focus on search input.
   */
  renderCardsOnly(cardsContainer, resultCountEl) {
    const filtered = this.getFilteredRecords();
    resultCountEl.textContent = `表示中：${filtered.length} 件（全 ${this.records.length} 件）`;
    cardsContainer.innerHTML = '';

    if (filtered.length === 0) {
      const empty = el('div', 'card state-box');
      empty.appendChild(
        el(
          'p',
          'lead-text',
          '当てはまる記録が見つかりませんでした。検索のことばを変えるか、絞り込みを「すべて」に戻してみてください。'
        )
      );
      cardsContainer.appendChild(empty);
      return;
    }

    filtered.forEach((rec) => {
      const layerCfg = LAYER_CONFIG.find((c) => c.key === rec.layer);
      const colorClass = layerCfg ? layerCfg.colorClass : 'layer-ui';

      const card = el('article', 'card db-record-card');

      const metaRow = el('div', 'db-record-meta');
      metaRow.appendChild(el('span', `badge ${colorClass}`, rec.layer));
      if (rec.episode_ref) {
        metaRow.appendChild(el('span', 'badge badge-neutral', rec.episode_ref));
      }
      if (rec.age_group) {
        metaRow.appendChild(el('span', 'badge badge-neutral', rec.age_group));
      }
      const sec = Number.parseInt(rec.hesitation_sec || '0', 10) || 0;
      if (sec > 0) {
        metaRow.appendChild(el('span', 'badge badge-time', `迷った時間：約${sec}秒`));
      }
      if (rec.recorded_date) {
        metaRow.appendChild(el('span', 'db-date', rec.recorded_date));
      }
      card.appendChild(metaRow);

      const grid = el('div', 'db-record-sections');

      const sitBox = el('div', 'db-field-block');
      sitBox.appendChild(el('h4', 'db-field-title', '📍 現場の事実（状況）'));
      sitBox.appendChild(el('p', 'db-field-text', rec.situation));
      grid.appendChild(sitBox);

      const voiceBox = el('div', 'db-field-block');
      voiceBox.appendChild(el('h4', 'db-field-title', '🗣️ 当事者の声・行動ログ'));
      voiceBox.appendChild(el('p', 'db-field-voice', rec.user_voice));
      grid.appendChild(voiceBox);

      const insightBox = el('div', 'db-field-block');
      insightBox.appendChild(el('h4', 'db-field-title', '💡 得られた知見・改善ヒント'));
      insightBox.appendChild(el('p', 'db-field-text', rec.insight));
      grid.appendChild(insightBox);

      const okBox = el('div', 'db-ok-phrase-box');
      okBox.appendChild(el('h4', 'db-ok-title', '💬 サポーターのOK声かけ例'));
      okBox.appendChild(el('p', 'db-ok-text', rec.supporter_ok_phrase));
      grid.appendChild(okBox);

      card.appendChild(grid);
      cardsContainer.appendChild(card);
    });
  }
}
