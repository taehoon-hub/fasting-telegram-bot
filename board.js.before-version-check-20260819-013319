console.log("BOARD JS VERSION: 20260818-reference");

(() => {
  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const params = new URLSearchParams(window.location.search);
  const group = params.get("group") || "";

  const el = {
    group: document.getElementById("group-label"),
    updated: document.getElementById("board-updated"),
    refresh: document.getElementById("refresh-button"),
    loading: document.getElementById("loading-box"),
    error: document.getElementById("error-box"),
    active: document.getElementById("active-section"),
    activeCount: document.getElementById("active-count"),
    activeBody: document.getElementById("active-body"),
    activeMobile: document.getElementById("active-mobile-list"),
    completedBody: document.getElementById("completed-body"),
    completedMobile: document.getElementById("completed-mobile-list"),
    completedEmpty: document.getElementById("completed-empty"),
    empty: document.getElementById("empty-box"),
    back: document.getElementById("back-button")
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function score(scores, key) {
    return Number(scores?.[key] ?? scores?.[String(key)] ?? 0);
  }

  function normalize(row, index, completed = false) {
    return {
      rank: Number(row?.rank || index + 1),
      name: String(row?.name || "이름 없음"),
      targetHours: Number(row?.targetHours || 0),
      progressPercent: Number(
        row?.progressPercent || (completed ? 100 : 0)
      ),
      scores: row?.scoreCounts || {},
      selfReviewStatus: row?.selfReviewStatus || null,
      selfReviewScore: row?.selfReviewScore ?? null
    };
  }

  function activeTableRow(row, index) {
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

  function completedTableRow(row, index) {
    const item = normalize(row, index, true);
    const review =
      item.selfReviewStatus === "completed"
        ? `완료${item.selfReviewScore ? ` · ${item.selfReviewScore}점` : ""}`
        : "대기중";

    return `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.targetHours}</td>
        <td>${score(item.scores, 100)}</td>
        <td>${score(item.scores, 95)}</td>
        <td>${score(item.scores, 90)}</td>
        <td>${score(item.scores, 80)}</td>
        <td>${review}</td>
      </tr>
    `;
  }

  function mobileCard(row, index, completed = false) {
    const item = normalize(row, index, completed);
    const title = completed
      ? escapeHtml(item.name)
      : `${item.rank}위 · ${escapeHtml(item.name)}`;

    const percent = completed ? "달성" : `${item.progressPercent}%`;

    const review = completed
      ? `
        <div class="mobile-card-meta">
          검수:
          ${
            item.selfReviewStatus === "completed"
              ? `완료${item.selfReviewScore ? ` · ${item.selfReviewScore}점` : ""}`
              : "대기중"
          }
        </div>
      `
      : "";

    return `
      <article class="mobile-card">
        <div class="mobile-card-top">
          <span class="mobile-card-name">${title}</span>
          <span class="mobile-card-percent">${percent}</span>
        </div>

        <div class="mobile-card-meta">목표 ${item.targetHours}시간</div>
        ${review}

        <div class="mobile-scores">
          <div class="mobile-score">100<strong>${score(item.scores, 100)}</strong></div>
          <div class="mobile-score">95<strong>${score(item.scores, 95)}</strong></div>
          <div class="mobile-score">90<strong>${score(item.scores, 90)}</strong></div>
          <div class="mobile-score">80<strong>${score(item.scores, 80)}</strong></div>
        </div>
      </article>
    `;
  }

  function formatDate(value) {
    if (!value) return "확인되지 않음";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "확인되지 않음";
    }

    return date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function render(data) {
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const completed = Array.isArray(data.completed)
      ? data.completed
      : [];

    el.group.textContent = data.group || group || "전체";

    el.updated.textContent =
      `데이터 기준: ${formatDate(data.generatedAt)} · ` +
      `다음 갱신: ${formatDate(data.nextRefreshAt)}`;

    el.activeCount.textContent = `${rows.length}명`;

    el.activeBody.innerHTML = rows
      .map(activeTableRow)
      .join("");

    el.activeMobile.innerHTML = rows
      .map((row, index) => mobileCard(row, index))
      .join("");

    el.active.hidden = rows.length === 0;
    el.empty.hidden = rows.length !== 0;

    el.completedBody.innerHTML = completed
      .map(completedTableRow)
      .join("");

    el.completedMobile.innerHTML = completed
      .map((row, index) => mobileCard(row, index, true))
      .join("");

    el.completedEmpty.hidden = completed.length !== 0;
  }

  async function load() {
    if (!group) {
      el.loading.hidden = true;
      el.error.hidden = false;
      el.error.textContent = "그룹 정보가 없습니다.";
      return;
    }

    el.loading.hidden = false;
    el.error.hidden = true;

    try {
      const response = await fetch(
        `/api/board?group=${encodeURIComponent(group)}`,
        {
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      render(data);
    } catch (error) {
      el.error.hidden = false;
      el.error.textContent =
        "현황판을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      console.error("board load error:", error);
    } finally {
      el.loading.hidden = true;
    }
  }

  el.refresh?.addEventListener("click", load);

  el.back?.addEventListener("click", () => {
    if (tg?.close) {
      tg.close();
    } else {
      window.history.back();
    }
  });

  load();
})();
