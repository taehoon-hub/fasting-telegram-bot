(() => {
  const tg = window.Telegram?.WebApp;
  const state = {
    groupTag: null,
    userId: null,
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
    return value > 0 ? `${value}회` : '';
  }

  function reviewCell(entry) {
    const completed = entry.selfReviewStatus === 'completed';
    return `<span class="${completed ? 'review-complete' : 'review-pending'}">${completed ? '완료' : '대기중'}</span>`;
  }

  function finalScoreCell(entry) {
    if (entry.selfReviewStatus !== 'completed' || !entry.selfReviewScore) return '';
    return `<span class="final-score">${escapeHtml(entry.selfReviewScore)}점</span>`;
  }

  function scoreCounts(entry) {
    return entry.scoreCounts || { 100: 0, 95: 0, 90: 0, 80: 0 };
  }

  function renderActive(entries) {
    elements.activeBody.innerHTML = entries.map((entry, index) => {
      const scores = scoreCounts(entry);
      return `<tr>
        <td class="rank-cell">${index + 1}</td>
        <td class="name-cell">${escapeHtml(entry.name)}</td>
        <td>${number(entry.targetHours)}시간</td>
        <td class="progress-cell">${number(entry.progressPercent)}%</td>
        <td class="score-cell ${scores[100] ? '' : 'empty'}">${scoreCell(scores[100])}</td>
        <td class="score-cell ${scores[95] ? '' : 'empty'}">${scoreCell(scores[95])}</td>
        <td class="score-cell ${scores[90] ? '' : 'empty'}">${scoreCell(scores[90])}</td>
        <td class="score-cell ${scores[80] ? '' : 'empty'}">${scoreCell(scores[80])}</td>
      </tr>`;
    }).join('');

    elements.activeCount.textContent = `${entries.length}명`;
    elements.activeSection.hidden = entries.length === 0;
  }

  function renderCompleted(entries) {
    elements.completedBody.innerHTML = entries.map((entry, index) => {
      const scores = scoreCounts(entry);
      return `<tr>
        <td class="rank-cell">${index + 1}</td>
        <td class="name-cell">${escapeHtml(entry.name)}</td>
        <td>${number(entry.targetHours)}시간</td>
        <td class="score-cell ${scores[100] ? '' : 'empty'}">${scoreCell(scores[100])}</td>
        <td class="score-cell ${scores[95] ? '' : 'empty'}">${scoreCell(scores[95])}</td>
        <td class="score-cell ${scores[90] ? '' : 'empty'}">${scoreCell(scores[90])}</td>
        <td class="score-cell ${scores[80] ? '' : 'empty'}">${scoreCell(scores[80])}</td>
        <td>${reviewCell(entry)}</td>
        <td>${finalScoreCell(entry)}</td>
      </tr>`;
    }).join('');

    elements.completedCount.textContent = `${entries.length}명`;
    elements.completedSection.hidden = entries.length === 0;
  }

  function formatUpdatedAt(value) {
    if (!value) return '업데이트 정보 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '업데이트 정보 없음';
    return `업데이트 ${date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })}`;
  }

  function setLoading(visible) {
    elements.loading.hidden = !visible;
  }

  function setError(message) {
    elements.error.textContent = message || '';
    elements.error.hidden = !message;
  }

  function getTelegramUserId() {
    return tg?.initDataUnsafe?.user?.id || null;
  }

  function getGroupTag() {
    const params = new URLSearchParams(window.location.search);
    return params.get('groupTag') || null;
  }

  function getInitData() {
    return tg?.initData || '';
  }

  async function loadBoard() {
    if (state.refreshInProgress) return;
    state.refreshInProgress = true;
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (state.groupTag) params.set('groupTag', state.groupTag);
      if (state.userId) params.set('userId', state.userId);
      if (getInitData()) params.set('initData', getInitData());

      const response = await fetch(`/api/board?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });

      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || '현황판을 불러오지 못했습니다.');
      }

      const board = payload.board || payload;
      state.groupTag = board.groupTag || state.groupTag || '';
      elements.title.textContent = `현황판 · ${state.groupTag}`;
      elements.updated.textContent = formatUpdatedAt(board.generatedAt);

      const active = Array.isArray(board.active) ? board.active : [];
      const completed = Array.isArray(board.completed) ? board.completed : [];
      renderActive(active);
      renderCompleted(completed);
      elements.empty.hidden = active.length > 0 || completed.length > 0;
    } catch (error) {
      console.error('현황판 로드 오류:', error);
      elements.activeSection.hidden = true;
      elements.completedSection.hidden = true;
      elements.empty.hidden = true;
      setError(error.message || '현황판을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      state.refreshInProgress = false;
    }
  }

  function initializeTelegram() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();

    if (tg.themeParams?.bg_color) {
      document.documentElement.style.setProperty('--bg', tg.themeParams.bg_color);
    }
  }

  elements.refresh.addEventListener('click', loadBoard);
  initializeTelegram();
  state.groupTag = getGroupTag();
  state.userId = getTelegramUserId();
  loadBoard();
})();
