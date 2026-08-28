console.log('BOARD JS VERSION: 20260817-7');

(() => {
  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const params = new URLSearchParams(window.location.search);
  const group = params.get('group');

  const elements = {
    refresh: document.getElementById('refresh-button'),
    title: document.getElementById('board-title'),
    updated: document.getElementById('board-updated'),
    loading: document.getElementById('loading-box'),
    error: document.getElementById('error-box'),
    activeSection: document.getElementById('active-section'),
    activeCount: document.getElementById('active-count'),
    activeBody: document.getElementById('active-body'),
    empty: document.getElementById('empty-box')
  };

  function setText(element, value) {
    if (element) {
      element.textContent = value;
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

  function render(rows) {
    if (elements.loading) {
      elements.loading.hidden = true;
    }

    if (elements.title) {
      elements.title.textContent = '공복 현황판';
    }

    if (elements.updated) {
      elements.updated.textContent =
        '그룹: ' + group + ' · 업데이트: ' +
        new Date().toLocaleTimeString('ko-KR');
    }

    if (!rows.length) {
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

    setText(elements.activeCount, rows.length + '명');

    if (elements.activeBody) {
      elements.activeBody.innerHTML = rows.map((row) => {
        const rank = Number(row.rank || 0);
        const name = String(row.name || '이름 없음');
        const target = Number(row.targetHours || 0);
        const percent = Number(row.progressPercent || 0);

        const scores = row.scoreCounts || {};

        function scoreCell(value) {
          const count = Number(value || 0);
          return count === 0 ? '' : String(count);
        }

        return '<tr>' +
          '<td>' + rank + '</td>' +
          '<td>' + name + '</td>' +
          '<td>' + target + '시간</td>' +
          '<td>' + percent + '%</td>' +
          '<td>' + scoreCell(scores[100]) + '</td>' +
          '<td>' + scoreCell(scores[95]) + '</td>' +
          '<td>' + scoreCell(scores[90]) + '</td>' +
          '<td>' + scoreCell(scores[80]) + '</td>' +
          '</tr>';
      }).join('');
    }
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
      const url = '/api/board?group=' + encodeURIComponent(group);
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'HTTP ' + response.status);
      }

      render(Array.isArray(data.rows) ? data.rows : []);
    } catch (error) {
      console.error('BOARD LOAD ERROR:', error);
      showError('현황판을 불러오지 못했습니다: ' + error.message);
    }
  }

  if (elements.refresh) {
    elements.refresh.addEventListener('click', loadBoard);
  }

  loadBoard();
})();
