console.log('BOARD JS VERSION: 20260817-3');

(() => {
  const tg = window.Telegram?.WebApp;
  const state = {
    group: null,
    refreshInProgress: false
  };

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const elements = {
    refresh: document.getElementById('refresh-button'),
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    group: document.getElementById('group')
  };

  function setStatus(message) {
    if (elements.status) {
      elements.status.textContent = message;
    }
  }

  function renderReview(completed) {
    const reviewClass = completed ? 'review-complete' : 'review-pending';
    const reviewText = completed ? '완료' : '대기 중';

    return '<span class="' + reviewClass + '">' + reviewText + '</span>';
  }

  function renderBoard(rows) {
    if (!elements.board) {
      return;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      elements.board.innerHTML = '<p>표시할 데이터가 없습니다.</p>';
      return;
    }

    elements.board.innerHTML = rows.map((row, index) => {
      const name = row.name || row.userName || row.username || '이름 없음';
      const hours = row.hours ?? row.fastingHours ?? row.duration ?? '-';
      const completed = Boolean(
        row.completed || row.reviewed || row.isCompleted
      );

      return '<div class="board-row">' +
        '<span class="rank">' + (index + 1) + '</span>' +
        '<span class="name">' + name + '</span>' +
        '<span class="hours">' + hours + '시간</span>' +
        renderReview(completed) +
        '</div>';
    }).join('');
  }

  async function loadBoard() {
    if (state.refreshInProgress) {
      return;
    }

    state.refreshInProgress = true;
    setStatus('불러오는 중...');

    try {
      const response = await fetch('/api/board', {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const data = await response.json();
      const rows = Array.isArray(data)
        ? data
        : (data.rows || data.board || data.data || []);

      renderBoard(rows);
      setStatus('업데이트 완료');
    } catch (error) {
      console.error('현황판 로딩 오류:', error);
      setStatus('데이터를 불러오지 못했습니다.');
    } finally {
      state.refreshInProgress = false;
    }
  }

  if (elements.refresh) {
    elements.refresh.addEventListener('click', loadBoard);
  }

  loadBoard();
})();
