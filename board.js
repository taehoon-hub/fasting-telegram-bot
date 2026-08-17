console.log('BOARD JS VERSION: 20260817-1');
(() => {
  const tg = window.Telegram?.WebApp;

  const state = {
    group: null,
    refreshInProgress: false
  };

  const elements = {
    title: document.getElementById('board-title'),
    updated: document.getElementById('board-updated'),
    loading: document.getElementById('loading-box'),
    error: document.getElementById('error-box'),
    empty: document.getElementById('empty-box'),
    activeSection: document.getElementById('active-section'),
    completedSection: document.getElementById('completed-section'),
    activeCount: document.getElementById('active-count'),
    completedCount: document.getElementById('completed-count'),
    activeBody: document.getElementById('active-body'),
    completedBody: document.getElementById('completed-body'),
    refresh: document.getElementById('refresh-button')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function number(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  function scoreCell(count) {
    const value = number(count);
    return value > 0 ? `${value}紐? : '-';
  }

  function reviewCell(entry) {
    const completed = entry.selfReviewStatus === 'completed';

    return `
      <span class="${completed ? 'review-complete' : 'review-pending'}">
        ${completed ? '?꾨즺' : '?湲?以?}
      </span>
    `;
  }

  function finalScoreCell(entry) {
    if (
      entry.selfReviewStatus !== 'completed' ||
      !entry.selfReviewScore
    ) {
      return '-';
    }

    return `
      <span class="final-score">
        ${escapeHtml(entry.selfReviewScore)}??      </span>
    `;
  }

  function scoreCounts(entry) {
    return entry.scoreCounts || {
      100: 0,
      95: 0,
      90: 0,
      80: 0
    };
  }

  function renderActive(entries) {
    if (!elements.activeBody) return;

    elements.activeBody.innerHTML = entries.map((entry, index) => {
      const scores = scoreCounts(entry);

      return `
        <tr>
          <td class="rank-cell">${index + 1}</td>
          <td class="name-cell">${escapeHtml(entry.name)}</td>
          <td>${number(entry.targetHours)}?쒓컙</td>
          <td class="progress-cell">${number(entry.progressPercent)}%</td>
          <td class="score-cell ${scores[100] ? '' : 'empty'}">
            ${scoreCell(scores[100])}
          </td>
          <td class="score-cell ${scores[95] ? '' : 'empty'}">
            ${scoreCell(scores[95])}
          </td>
          <td class="score-cell ${scores[90] ? '' : 'empty'}">
            ${scoreCell(scores[90])}
          </td>
          <td class="score-cell ${scores[80] ? '' : 'empty'}">
            ${scoreCell(scores[80])}
          </td>
        </tr>
      `;
    }).join('');

    if (elements.activeCount) {
      elements.activeCount.textContent = `${entries.length}紐?;
    }

    if (elements.activeSection) {
      elements.activeSection.hidden = entries.length === 0;
    }
  }

  function renderCompleted(entries) {
    if (!elements.completedBody) return;

    elements.completedBody.innerHTML = entries.map((entry, index) => {
      const scores = scoreCounts(entry);

      return `
        <tr>
          <td class="rank-cell">${index + 1}</td>
          <td class="name-cell">${escapeHtml(entry.name)}</td>
          <td>${number(entry.targetHours)}?쒓컙</td>
          <td class="score-cell ${scores[100] ? '' : 'empty'}">
            ${scoreCell(scores[100])}
          </td>
          <td class="score-cell ${scores[95] ? '' : 'empty'}">
            ${scoreCell(scores[95])}
          </td>
          <td class="score-cell ${scores[90] ? '' : 'empty'}">
            ${scoreCell(scores[90])}
          </td>
          <td class="score-cell ${scores[80] ? '' : 'empty'}">
            ${scoreCell(scores[80])}
          </td>
          <td>${reviewCell(entry)}</td>
          <td>${finalScoreCell(entry)}</td>
        </tr>
      `;
    }).join('');

    if (elements.completedCount) {
      elements.completedCount.textContent = `${entries.length}紐?;
    }

    if (elements.completedSection) {
      elements.completedSection.hidden = entries.length === 0;
    }
  }

  function formatUpdatedAt(value) {
    if (!value) {
      return '?낅뜲?댄듃 ?뺣낫 ?놁쓬';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '?낅뜲?댄듃 ?뺣낫 ?놁쓬';
    }

    return `?낅뜲?댄듃 ${date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  }

  function setLoading(visible) {
    if (elements.loading) {
      elements.loading.hidden = !visible;
    }
  }

  function setError(message) {
    if (!elements.error) return;

    elements.error.textContent = message || '';
    elements.error.hidden = !message;
  }

  function getGroup() {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get('group') ||
      params.get('groupTag') ||
      ''
    );
  }

  async function loadBoard() {
    if (state.refreshInProgress) return;

    state.refreshInProgress = true;
    setLoading(true);
    setError('');

    try {
      const group = state.group || getGroup();

      if (!group) {
        throw new Error('洹몃９ ?뺣낫媛 ?놁뒿?덈떎.');
      }

      const params = new URLSearchParams();
      params.set('group', group);

      const response = await fetch(
        `/api/board?${params.toString()}`,
        {
          headers: {
            Accept: 'application/json'
          }
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error || `?꾪솴??API ?ㅻ쪟: ${response.status}`
        );
      }

      const rows = Array.isArray(payload.rows)
        ? payload.rows
        : [];

      state.group = payload.group || group;

      if (elements.title) {
        elements.title.textContent = `怨듬났 ?꾪솴??쨌 ${state.group}`;
      }

      if (elements.updated) {
        elements.updated.textContent = formatUpdatedAt(
          payload.updatedAt || new Date().toISOString()
        );
      }

      renderActive(rows);
      renderCompleted([]);

      if (elements.empty) {
        elements.empty.hidden = rows.length > 0;
      }
    } catch (error) {
      console.error('?꾪솴??濡쒕뱶 ?ㅻ쪟:', error);

      if (elements.activeSection) {
        elements.activeSection.hidden = true;
      }

      if (elements.completedSection) {
        elements.completedSection.hidden = true;
      }

      if (elements.empty) {
        elements.empty.hidden = true;
      }

      setError(
        error.message || '?꾪솴?먯쓣 遺덈윭?ㅼ? 紐삵뻽?듬땲??'
      );
    } finally {
      setLoading(false);
      state.refreshInProgress = false;

      if (tg) {
        tg.ready();
      }
    }
  }

  function initializeTelegram() {
    if (!tg) return;

    tg.ready();
    tg.expand();

    if (typeof tg.enableClosingConfirmation === 'function') {
      tg.enableClosingConfirmation();
    }

    if (tg.themeParams?.bg_color) {
      document.documentElement.style.setProperty(
        '--bg',
        tg.themeParams.bg_color
      );
    }
  }

  if (elements.refresh) {
    elements.refresh.addEventListener('click', loadBoard);
  }

  initializeTelegram();

  state.group = getGroup();
  loadBoard();
})();
