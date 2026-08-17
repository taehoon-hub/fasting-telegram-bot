console.log('BOARD JS VERSION: 20260817-4');

(() => {
  const tg = window.Telegram?.WebApp;
  const state = { group: null, refreshInProgress: false };

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const params = new URLSearchParams(window.location.search);
  const group = params.get('group');
  state.group = group;

  const elements = {
    refresh: document.getElementById('refresh-button'),
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    group: document.getElementById('group')
  };

  function show(message) {
    if (elements.status) {
      elements.status.textContent = message;
    }

    if (elements.board && !elements.board.innerHTML.trim()) {
      elements.board.innerHTML = '<p>' + message + '</p>';
    }
  }

  function renderBoard(rows) {
    if (!elements.board) {
      show('board 요소를 찾지 못했습니다. board.html의 id를 확인하세요.');
      return;
    }

    if (!rows.length) {
      elements.board.innerHTML = '<p>현재 진행 중인 공복 세션이 없습니다.</p>';
      return;
    }

    elements.board.innerHTML = rows.map((row, index) => {
      const name = row.name || '이름 없음';
      const percent = Number(row.progressPercent ?? 0);

      return '<div class="board-row">' +
        '<span class="rank">' + (index + 1) + '</span>' +
        '<span class="name">' + name + '</span>' +
        '<span class="hours">' + percent + '%</span>' +
        '</div>';
    }).join('');
  }

  async function loadBoard() {
    if (state.refreshInProgress) {
      return;
    }

    state.refreshInProgress = true;
    show('현황판을 불러오는 중...');

    try {
      if (!group) {
        throw new Error(
          'URL에 group 값이 없습니다. Telegram 버튼의 Web App URL을 확인하세요.'
        );
      }

      const url = '/api/board?group=' + encodeURIComponent(group);
      console.log('BOARD API REQUEST:', url);

      const response = await fetch(url, { cache: 'no-store' });
      const raw = await response.text();

      console.log('BOARD API RESPONSE:', response.status, raw);

      if (!response.ok) {
        throw new Error(
          'API 오류 HTTP ' + response.status + ': ' + raw.slice(0, 120)
        );
      }

      const data = JSON.parse(raw);
      renderBoard(Array.isArray(data.rows) ? data.rows : []);

      if (elements.status) {
        elements.status.textContent = '업데이트 완료';
      }
    } catch (error) {
      console.error('BOARD LOAD ERROR:', error);
      show('현황판 오류: ' + error.message);
    } finally {
      state.refreshInProgress = false;
    }
  }

  if (elements.refresh) {
    elements.refresh.addEventListener('click', loadBoard);
  }

  loadBoard();
})();
