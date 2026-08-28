console.log('BOARD JS VERSION: 20260818-1');

(() => {
  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const params = new URLSearchParams(window.location.search);
  const group = params.get('group') || '';

  const elements = {
    refresh: document.getElementById('refresh-button'),
    title: document.getElementById('board-title'),
    updated: document.getElementById('board-updated'),
    loading: document.getElementById('loading-box'),
    error: document.getElementById('error-box'),
    activeSection: document.getElementById('active-section'),
    activeCount: document.getElementById('active-count'),
    activeBody: document.getElementById('active-body'),
    completedBody: document.getElementById('completed-body'),
    empty: document.getElementById('empty-box')
  };

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function scoreValue(scores, key) {
    return Number(
      scores?.[key] ??
      scores?.[String(key)] ??
      0
    );
  }

  function scoreText(scores, key) {
    const value = scoreValue(scores, key);
    return value === 0 ? '-' : String(value);
  }

  function normalizeRow(row, index) {
    const scores = row?.scoreCounts || {};

    return {
      rank: Number(row?.rank || index + 1),
      name: String(row?.name || '이름 없음'),
      targetHours: Number(row?.targetHours || 0),
      progressPercent: Number(row?.progressPercent || 0),
      scores
    };
  }

  function renderTableRow(row, index) {
    const item = normalizeRow(row, index);

    return `
      <tr>
        <td>${item.rank}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.targetHours}시간</td>
        <td>${item.progressPercent}%</td>
        <td>${scoreText(item.scores, 100)}</td>
        <td>${scoreText(item.scores, 95)}</td>
        <td>${scoreText(item.scores, 90)}</td>
        <td>${scoreText(item.scores, 80)}</td>
      </tr>
    `;
  }

  function renderMobileCard(row, index) {
    const item = normalizeRow(row, index);

    return `
      <article class="mobile-board-card">
        <div class="mobile-board-card-header">
          <span class="mobile-board-rank">${item.rank}위</span>
          <span class="mobile-board-name">${escapeHtml(item.name)}</span>
          <span class="mobile-board-progress">${item.progressPercent}%</span>
        </div>

        <div class="mobile-board-target">
          목표 ${item.targetHours}시간
        </div>

        <div class="mobile-board-info">
          <div class="mobile-board-score">
            <span>100점</span>
            <strong>${scoreText(item.scores, 100)}</strong>
          </div>
          <div class="mobile-board-score">
            <span>95점</span>
            <strong>${scoreText(item.scores, 95)}</strong>
          </div>
          <div class="mobile-board-score">
            <span>90점</span>
            <strong>${scoreText(item.scores, 90)}</strong>
          </div>
          <div class="mobile-board-score">
            <span>80점</span>
            <strong>${scoreText(item.scores, 80)}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function ensureMobileCards(containerId, tableId) {
    let cards = document.getElementById(containerId);

    if (cards) {
      return cards;
    }

    const table = document.getElementById(tableId);

    if (!table) {
      return null;
    }

    cards = document.createElement('div');
    cards.id = containerId;
    cards.className = 'mobile-board-cards';
    table.insertAdjacentElement('afterend', cards);

    return cards;
  }

  function renderRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (elements.activeBody) {
      elements.activeBody.innerHTML = safeRows
        .map(renderTableRow)
        .join('');
    }

    const activeCards = ensureMobileCards(
      'active-mobile-cards',
      'active-body'
    );

    if (activeCards) {
      activeCards.innerHTML = safeRows
        .map(renderMobileCard)
        .join('');
    }

    setText(elements.activeCount, safeRows.length + '명');

    if (!safeRows.length) {
      if (elements.empty) {
        elements.empty.hidden = false;
        elements.empty.textContent = '현재 진행 중인 공복 데이터가 없습니다.';
      }

      if (elements.activeSection) {
        elements.activeSection.hidden = true;
      }

      return;
    }

    if (elements.empty) {
      elements.empty.hidden = true;
    }

    if (elements.activeSection) {
      elements.activeSection.hidden = false;
    }
  }

  function renderCompleted(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (elements.completedBody) {
      elements.completedBody.innerHTML = safeRows
        .map(renderTableRow)
        .join('');
    }

    const completedCards = ensureMobileCards(
      'completed-mobile-cards',
      'completed-body'
    );

    if (completedCards) {
      completedCards.innerHTML = safeRows
        .map(renderMobileCard)
        .join('');
    }
  }

  function showError(message) {
    if (elements.loading) {
      elements.loading.hidden = true;
    }

    if (elements.error) {
      elements.error.hidden = false;
      elements.error.textContent = message;
    }
  }

  function readRows(data) {
    if (Array.isArray(data?.rows)) {
      return data.rows;
    }

    if (Array.isArray(data)) {
      return data;
    }

    return [];
  }

  async function loadBoard() {
    if (!group) {
      showError('그룹 정보가 없습니다.');
      return;
    }

    if (elements.loading) {
      elements.loading.hidden = false;
      elements.loading.textContent = '현황판을 불러오는 중...';
    }

    if (elements.error) {
      elements.error.hidden = true;
    }

    try {
      const url = '/api/board?group=' +
        encodeURIComponent(group);

      const response = await fetch(url, {
        cache: 'no-store'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'HTTP ' + response.status);
      }

      const rows = readRows(data);

      renderRows(rows);
      renderCompleted(
        Array.isArray(data.completed)
          ? data.completed
          : []
      );

      if (elements.loading) {
        elements.loading.hidden = true;
      }

      setText(elements.title, '공복 현황판');
      setText(
        elements.updated,
        '그룹: ' + group + ' · 업데이트: ' +
        new Date().toLocaleTimeString('ko-KR')
      );
    } catch (error) {
      console.error('BOARD LOAD ERROR:', error);
      showError(
        '현황판을 불러오지 못했습니다: ' +
        error.message
      );
    }
  }

  if (elements.refresh) {
    elements.refresh.addEventListener('click', loadBoard);
  }

  loadBoard();
})();