console.log("BOARD JS LIVE ROW FIX: 202608192352");

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

  function normalize(row, index, completed) {
    return {
      rank: Number(row?.rank || index + 1),
      name: String(row?.name || "\uC774\uB984 \uC5C6\uC74C"),
      targetHours: Number(row?.targetHours || 0),
      progressPercent: Number(
        row?.progressPercent ?? (completed ? 100 : 0)
      ),
      scores: row?.scoreCounts || {},
      selfReviewStatus: row?.selfReviewStatus || null,
      selfReviewScore: row?.selfReviewScore ?? null
    };
  }

  function activeTableRow(row, index) {
    const item = normalize(row, index, false);

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
        ? "\uC644\uB8CC" +
          (item.selfReviewScore ? ` \u00B7 ${item.selfReviewScore}\uC810` : "")
        : "\uB300\uAE30\uC911";

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

  function mobileCard(row, index, completed) {
    const item = normalize(row, index, completed);
    const title = completed
      ? escapeHtml(item.name)
      : `${item.rank}\uC704 \u00B7 ${escapeHtml(item.name)}`;

    const percent = completed
      ? "\uB2EC\uC131"
      : `${item.progressPercent}%`;

    const review = completed
      ? `
        <div class="mobile-card-meta">
          \uAC80\uC218:
          ${
            item.selfReviewStatus === "completed"
              ? "\uC644\uB8CC" +
                (item.selfReviewScore
                  ? ` \u00B7 ${item.selfReviewScore}\uC810`
                  : "")
              : "\uB300\uAE30\uC911"
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

        <div class="mobile-card-meta">
          \uBAA9\uD45C ${item.targetHours}\uC2DC\uAC04
        </div>

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
    if (!value) {
      return "\uD655\uC778\uB418\uC9C0 \uC54A\uC74C";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "\uD655\uC778\uB418\uC9C0 \uC54A\uC74C";
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

    if (el.group) {
      el.group.textContent = data.group || group || "\uC804\uCCB4";
    }

    if (el.updated) {
      el.updated.textContent =
        `\uB370\uC774\uD130 \uAE30\uC900: ${formatDate(data.generatedAt)} \u00B7 ` +
        `\uB2E4\uC74C \uAC31\uC2E0: ${formatDate(data.nextRefreshAt)}`;
    }

    if (el.activeCount) {
      el.activeCount.textContent = `${rows.length}\uBA85`;
    }

    if (el.activeBody) {
      el.activeBody.innerHTML = rows
        .map(activeTableRow)
        .join("");
    }

    if (el.activeMobile) {
      el.activeMobile.innerHTML = rows
        .map((row, index) => mobileCard(row, index, false))
        .join("");
    }

    if (el.active) {
      el.active.hidden = rows.length === 0;
    }

    if (el.empty) {
      el.empty.hidden = rows.length !== 0;
    }

    if (el.completedBody) {
      el.completedBody.innerHTML = completed
        .map(completedTableRow)
        .join("");
    }

    if (el.completedMobile) {
      el.completedMobile.innerHTML = completed
        .map((row, index) => mobileCard(row, index, true))
        .join("");
    }

    if (el.completedEmpty) {
      el.completedEmpty.hidden = completed.length !== 0;
    }
  }

  async function load() {
    if (!group) {
      if (el.loading) el.loading.hidden = true;
      if (el.error) {
        el.error.hidden = false;
        el.error.textContent = "\uADF8\uB8F9 \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
      }
      return;
    }

    if (el.loading) el.loading.hidden = false;
    if (el.error) el.error.hidden = true;

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
      console.log("BOARD API ROWS:", Array.isArray(data.rows) ? data.rows.length : 0);
      render(data);
    } catch (error) {
      if (el.error) {
        el.error.hidden = false;
        el.error.textContent =
          "\uD604\uD669\uD310\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
      }
      console.error("board load error:", error);
    } finally {
      if (el.loading) el.loading.hidden = true;
    }
  }

  if (el.refresh) {
    el.refresh.addEventListener("click", load);
  }

  if (el.back) {
    el.back.addEventListener("click", () => {
      if (tg?.close) {
        tg.close();
      } else {
        window.history.back();
      }
    });
  }

  load();
})();