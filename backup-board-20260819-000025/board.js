console.log('BOARD JS VERSION: 20260818-3');

(() => {
  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const params = new URLSearchParams(window.location.search);
  const group = params.get('group') || '';

  const el = {
    title: document.getElementById('board-title'),
    group: document.getElementById('group-label'),
    updated: document.getElementById('board-updated'),
    refresh: document.getElementById('refresh-button'),
    loading: document.getElementById('loading-box'),
    error: document.getElementById('error-box'),
    active: document.getElementById('active-section'),
    activeCount: document.getElementById('active-count'),
    activeBody: document.getElementById('active-body'),
    activeMobile: document.getElementById('active-mobile-list'),
    completedBody: document.getElementById('completed-body'),
    completedMobile: document.getElementById('completed-mobile-list'),
    completedEmpty: document.getElementById('completed-empty'),
    empty: document.getElementById('empty-box')
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function score(scores, key) {
    const value = Number(
      scores?.[key] ??
      scores?.[String(key)] ??
      0
    );

    return value === 0 ? '0' : String(value);
  }

  function normalize(row, index) {
    return {
      rank: Number(row?.rank || index + 1),
      name: String(row?.name || '이름 없음'),
      targetHours: Number(row?.targetHours || 0),
      progressPercent: Number(row?.progressPercent || 0),
      scores: row?.scoreCounts || {}
    };
  }

  function tableRow(row, index) {
    const item = normalize(row, index);

    return `
      <tr>
        <td>${item.rank}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.targetHours}</td>
        <td>${item.progressPercent}%</td>
        <td>${score(item.scores, 100)}</td>
        <td>${score(item.scores, 95)}</td>
        <td>${score(item.scores, 90)}</td>
        <td>${score(item.scores, 80)}</td>
      </tr>
    `;
  }

  function mobileRow(row, index) {
    const item = normalize(row, index);

    return `
      <article class="mobile-row">
        <div class="mobile-row-top">
          <span class="mobile-rank">${item.rank}위</span>
          <span class="mobile-name">${escapeHtml(item.name)}</span>
          <span class="mobile-percent">${item.progressPercent}%</span>
        </div>

        <div class="mobile-target">
          목표 ${item.targetHours}시간
        </div>

        <div class="mobile-scores">
          <div class="mobile-score">
            100
            <strong>${score(item.scores, 100)}</strong>
          </div>
          <div class="mobile-score">
            95
            <strong>${score(item.scores, 95)}</strong>
          </div>
          <div class="mobile-score">
            90
            <strong>${score(item.scores, 90)}</strong>
          </div>
          <div class="mobile-score">
            80
            <strong>${score(item.scores, 80)}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function renderActive(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (el.activeBody) {
      el.activeBody.innerHTML = safeRows
        .map(tableRow)
        .join('');
    }

    if (el.activeMobile) {
      el.activeMobile.innerHTML = safeRows
        .map(mobileRow)
        .join('');
    }

    if (el.activeCount) {
      el.activeCount.textContent = ` (${safeRows.length}명)`;
    }

    if (el.active) {
      el.active.hidden = safeRows.length === 0;
    }

    if (el.empty) {
      el.empty.hidden = safeRows.length !== 0;
    }
  }

  function renderCompleted(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (el.completedBody) {
      el.completedBody.innerHTML = safeRows
        .map((row, index) => {
          const item = normalize(row, index);

          return `
            <tr>
              <td>${escapeHtml(item.name)}</td>
              <td>${item.targetHours}</td>
              <td>${score(item.scores, 100)}</td>
              <td>${score(item.scores, 95)}</td>
              <td>${score(item.scores, 90)}</td>
              <td>${score(item.scores, 80)}</td>
              <td>-</td>
            </tr>
          `;
        })
        .join('');
    }

    if (el.completedMobile) {
      el.completedMobile.innerHTML = safeRows
        .map(mobileRow)
        .join('');
    }

    if (el.completedEmpty) {
      el.completedEmpty.hidden = safeRows.length !== 0;
    }
  }

  async function loadBoard() {
    if (!group) {
      if (el.error) {
        el.error.hidden = false;
        el.error.textContent = '그룹 정보가 없습니다.';
      }
      return;
    }

    if (el.loading) {
      el.loading.hidden = false;
    }

    try {
      const response = await fetch(
        '/api/board?group=' +
        encodeURIComponent(group),
        { cache: 'no-store' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const rows = Array.isArray(data.rows)
        ? data.rows
        : [];

      const completed = Array.isArray(data.completed)
        ? data.completed
        : [];

      renderActive(rows);
      renderCompleted(completed);

      if (el.title) {
        el.title.textContent = '현황판';
      }

      if (el.group) {
        el.group.textContent = group;
      }

      if (el.updated) {
        el.updated.textContent =
          '데이터 기준: ' +
          new Date().toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric'
          }) +
          ' · 업데이트: ' +
          new Date().toLocaleTimeString('ko-KR');
      }

      if (el.loading) {
        el.loading.hidden = true;
      }

      if (el.error) {
        el.error.hidden = true;
      }
    } catch (error) {
      console.error('BOARD LOAD ERROR:', error);

      if (el.loading) {
        el.loading.hidden = true;
      }

      if (el.error) {
        el.error.hidden = false;
        el.error.textContent =
          '현황판을 불러오지 못했습니다: ' +
          error.message;
      }
    }
  }

  if (el.refresh) {
    el.refresh.addEventListener('click', loadBoard);
  }

  loadBoard();
})();