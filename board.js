console.log('BOARD JS VERSION: 20260817-5');

(() => {
  document.body.innerHTML = '<div id="board-diagnostic" style="font-family: sans-serif; padding: 24px; color: #111; background: #fff; min-height: 100vh; box-sizing: border-box;"><h2>현황판 진단 화면</h2><p>board.js는 실행되었습니다.</p><p id="diag-status">확인 중...</p><pre id="diag-detail" style="white-space: pre-wrap; background: #f3f3f3; padding: 12px;"></pre></div>';

  const status = document.getElementById('diag-status');
  const detail = document.getElementById('diag-detail');
  const params = new URLSearchParams(window.location.search);
  const group = params.get('group');

  async function run() {
    if (!group) {
      status.textContent = '오류: URL에 group 값이 없습니다.';
      detail.textContent = window.location.href;
      return;
    }

    const url = '/api/board?group=' + encodeURIComponent(group);
    detail.textContent = '요청: ' + url;

    try {
      const response = await fetch(url, { cache: 'no-store' });
      const text = await response.text();

      status.textContent = 'API 응답: HTTP ' + response.status;
      detail.textContent += '\n\n응답:\n' + text;
    } catch (error) {
      status.textContent = '네트워크 오류';
      detail.textContent += '\n\n' + String(error);
    }
  }

  run();
})();
