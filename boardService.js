const DEFAULT_ACTIVE_LIMIT = 50;
const DEFAULT_COMPLETED_LIMIT = 50;

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function groupIdFromTag(groupTag) {
  return String(groupTag || 'unknown').trim().replace(/\//g, '_');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function progressPercent(session, now = new Date()) {
  const startedAt = toDate(session.startedAt);
  const targetAt = toDate(session.targetAt);
  if (!startedAt || !targetAt) return 0;

  const total = targetAt.getTime() - startedAt.getTime();
  const elapsed = now.getTime() - startedAt.getTime();
  if (total <= 0) return 100;

  return Math.max(0, Math.min(100, Math.floor((elapsed / total) * 100)));
}

function buildScoreCounts(scores) {
  const counts = { 100: 0, 95: 0, 90: 0, 80: 0 };

  for (const score of scores || []) {
    const numericScore = Number(score);
    if (Object.prototype.hasOwnProperty.call(counts, numericScore)) {
      counts[numericScore] += 1;
    }
  }

  return counts;
}

function buildScoreSummary(counts) {
  return [100, 95, 90, 80]
    .filter((score) => counts?.[score] > 0)
    .map((score) => `${score}점(${counts[score]}회)`)
    .join(' · ');
}

function boardEntryFromSession(session, scoreCounts = null) {
  const completedAt = toDate(session.completedAt);
  const boardExpireAt = toDate(session.boardExpireAt || session.expireAt);
  const counts = scoreCounts || { 100: 0, 95: 0, 90: 0, 80: 0 };

  return {
    userId: String(session.userId),
    name: session.displayName || session.name || '이름 없음',
    groupTag: session.groupTag || '',
    targetHours: Number(session.targetHours || 0),
    progressPercent: session.status === 'active' ? progressPercent(session) : 100,
    status: session.status || 'active',
    completionType: session.completionType || null,
    selfReviewStatus: session.selfReviewStatus || null,
    selfReviewScore: session.selfReviewScore ?? null,
    scoreCounts: counts,
    scoreSummary: buildScoreSummary(counts),
    completedAt,
    boardExpireAt,
    updatedAt: new Date()
  };
}

async function loadScoreMap(db) {
  const snapshot = await db.collection('checkIns').get();
  const scoreMap = new Map();

  for (const document of snapshot.docs) {
    const data = document.data();
    const userId = String(data.userId || '');
    if (!userId) continue;

    if (!scoreMap.has(userId)) scoreMap.set(userId, []);
    scoreMap.get(userId).push(data.score);
  }

  const countMap = new Map();
  for (const [userId, scores] of scoreMap.entries()) {
    countMap.set(userId, buildScoreCounts(scores));
  }

  return countMap;
}

async function generateGroupSnapshot(db, groupTag) {
  const groupId = groupIdFromTag(groupTag);
  const now = new Date();
  const scoreMap = await loadScoreMap(db);
  const entries = new Map();

  const liveSnapshot = await db
    .collection('liveSessions')
    .where('status', '==', 'active')
    .get();

  for (const document of liveSnapshot.docs) {
    const session = document.data();
    if (session.groupTag !== groupTag) continue;

    const userId = String(session.userId || document.id);
    entries.set(userId, boardEntryFromSession(
      { ...session, userId },
      scoreMap.get(userId) || { 100: 0, 95: 0, 90: 0, 80: 0 }
    ));
  }

  const completedSnapshot = await db.collection('completedSessions').get();

  for (const document of completedSnapshot.docs) {
    const session = document.data();
    if (session.groupTag !== groupTag) continue;

    const expireAt = toDate(session.boardExpireAt || session.expireAt);
    if (expireAt && expireAt <= now) continue;

    const userId = String(session.userId || document.id);
    entries.set(`completed_${userId}`, boardEntryFromSession(
      { ...session, userId, status: 'completed' },
      scoreMap.get(userId) || { 100: 0, 95: 0, 90: 0, 80: 0 }
    ));
  }

  const entriesRef = db
    .collection('boardSnapshots')
    .doc(groupId)
    .collection('entries');

  const oldEntries = await entriesRef.get();
  const batch = db.batch();

  for (const oldEntry of oldEntries.docs) batch.delete(oldEntry.ref);
  for (const [key, entry] of entries.entries()) {
    batch.set(entriesRef.doc(key), entry);
  }

  batch.set(
    db.collection('boardSnapshots').doc(groupId),
    {
      groupTag,
      generatedAt: now,
      activeCount: [...entries.values()].filter((entry) => entry.status === 'active').length,
      completedCount: [...entries.values()].filter((entry) => entry.status === 'completed').length,
      reportStatus: 'ready',
      updatedAt: now
    },
    { merge: true }
  );

  await batch.commit();

  return {
    groupId,
    groupTag,
    generatedAt: now,
    entries: [...entries.values()]
  };
}

async function getBoardEntries(db, groupTag, ownUserId) {
  const groupId = groupIdFromTag(groupTag);
  const snapshotRef = db.collection('boardSnapshots').doc(groupId);
  const snapshot = await snapshotRef.get();
  const entriesSnapshot = await snapshotRef.collection('entries').get();
  const entries = entriesSnapshot.docs.map((document) => document.data());
  const scoreMap = await loadScoreMap(db);

  const ownSessionSnapshot = await db
    .collection('liveSessions')
    .doc(String(ownUserId))
    .get();

  if (ownSessionSnapshot.exists) {
    const ownSession = ownSessionSnapshot.data();

    if (ownSession.status === 'active' && ownSession.groupTag === groupTag) {
      const ownEntry = boardEntryFromSession(
        { ...ownSession, userId: String(ownUserId) },
        scoreMap.get(String(ownUserId)) || { 100: 0, 95: 0, 90: 0, 80: 0 }
      );

      const existingIndex = entries.findIndex(
        (entry) => String(entry.userId) === String(ownUserId)
      );

      if (existingIndex >= 0) entries[existingIndex] = ownEntry;
      else entries.push(ownEntry);
    }
  }

  const active = entries
    .filter((entry) => entry.status === 'active')
    .sort((a, b) => b.progressPercent - a.progressPercent)
    .slice(0, DEFAULT_ACTIVE_LIMIT);

  const completed = entries
    .filter((entry) => entry.status === 'completed')
    .sort((a, b) => {
      const aDate = toDate(a.completedAt)?.getTime() || 0;
      const bDate = toDate(b.completedAt)?.getTime() || 0;
      return bDate - aDate;
    })
    .slice(0, DEFAULT_COMPLETED_LIMIT);

  return {
    groupTag,
    generatedAt: snapshot.exists ? snapshot.data().generatedAt : null,
    active,
    completed
  };
}

function completedReview(entry) {
  return entry.selfReviewStatus === 'completed' ? '완료' : '대기중';
}

function finalScore(entry) {
  return entry.selfReviewStatus === 'completed' && entry.selfReviewScore
    ? `${entry.selfReviewScore}점`
    : '';
}

function compactScoreCell(count) {
  return count > 0 ? `${count}회` : '';
}

function buildBoardMessage(board) {
  const generatedAt = toDate(board.generatedAt);
  const updateText = generatedAt
    ? generatedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
    : '아직 생성되지 않음';

  let text = `<b>현황판 · ${escapeHtml(board.groupTag)}</b>\n`;
  text += `업데이트: ${escapeHtml(updateText)}\n\n`;
  text += '<b>[현재 진행 순위]</b>\n';

  if (board.active.length === 0) {
    text += '현재 진행 중인 공복이 없습니다.\n';
  } else {
    board.active.forEach((entry, index) => {
      text += `${index + 1}. ${escapeHtml(entry.name)}  ${entry.targetHours}시간  ${entry.progressPercent}%\n`;
      text += `   100점 ${compactScoreCell(entry.scoreCounts?.[100])}  `;
      text += `95점 ${compactScoreCell(entry.scoreCounts?.[95])}  `;
      text += `90점 ${compactScoreCell(entry.scoreCounts?.[90])}  `;
      text += `80점 ${compactScoreCell(entry.scoreCounts?.[80])}\n`;
    });
  }

  text += '\n<b>[공복 목표 달성]</b>\n';

  if (board.completed.length === 0) {
    text += '최근 24시간 내 목표 달성자가 없습니다.\n';
  } else {
    board.completed.forEach((entry, index) => {
      text += `${index + 1}. ${escapeHtml(entry.name)}  ${entry.targetHours}시간\n`;
      text += `   100점 ${compactScoreCell(entry.scoreCounts?.[100])}  `;
      text += `95점 ${compactScoreCell(entry.scoreCounts?.[95])}  `;
      text += `90점 ${compactScoreCell(entry.scoreCounts?.[90])}  `;
      text += `80점 ${compactScoreCell(entry.scoreCounts?.[80])}\n`;
      text += `   검수: ${completedReview(entry)}  최종점수: ${finalScore(entry) || ' '}\n`;
    });
  }

  return text;
}

module.exports = {
  groupIdFromTag,
  generateGroupSnapshot,
  getBoardEntries,
  buildBoardMessage,
  progressPercent,
  buildScoreCounts,
  buildScoreSummary,
  completedReview,
  finalScore
};
