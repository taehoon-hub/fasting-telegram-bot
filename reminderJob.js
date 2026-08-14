require('dotenv').config();

const { generateGroupSnapshot } = require('./boardService');

const FIRST_CHECKIN_MINUTES = Number(process.env.FIRST_CHECKIN_MINUTES || 120);
const BOARD_SNAPSHOT_MINUTES = Number(process.env.BOARD_SNAPSHOT_MINUTES || 30);
const LOOP_INTERVAL_MS = 15000;

const scoreKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '100점', callback_data: 'fast_score_100' },
        { text: '95점', callback_data: 'fast_score_95' }
      ],
      [
        { text: '90점', callback_data: 'fast_score_90' },
        { text: '80점', callback_data: 'fast_score_80' }
      ],
      [{ text: '알림 끄기', callback_data: 'fast_alert_off' }]
    ]
  }
};

const reviewKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '100점', callback_data: 'fast_review_100' },
        { text: '95점', callback_data: 'fast_review_95' }
      ],
      [
        { text: '90점', callback_data: 'fast_review_90' },
        { text: '80점', callback_data: 'fast_review_80' }
      ],
      [{ text: '알림 끄기', callback_data: 'fast_alert_off' }]
    ]
  }
};

const completedKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '다음 공복 시작', callback_data: 'fast_start' }],
      [{ text: '현황판 보기', callback_data: 'fast_board' }],
      [{ text: '공유하기', switch_inline_query: '공복 목표를 달성했어요🎉' }]
    ]
  }
};

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

async function completeSession(bot, db, document, session) {
  const now = new Date();
  const userId = String(session.userId || document.id);
  const completedRef = db.collection('completedSessions').doc(userId);
  const expireAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await completedRef.set({
    userId,
    telegramUserId: userId,
    chatId: String(session.chatId),
    name: session.name,
    displayName: session.displayName || session.name,
    groupTag: session.groupTag,
    targetHours: Number(session.targetHours || 0),
    startedAt: session.startedAt,
    completedAt: now,
    expireAt,
    boardExpireAt: expireAt,
    progressPercent: 100,
    completionType: 'autoCompleted',
    selfReviewStatus: 'pending',
    selfReviewScore: null,
    selfReviewedAt: null,
    updatedAt: now
  }, { merge: true });

  await document.ref.update({
    status: 'completed',
    completedAt: now,
    updatedAt: now
  });

  await bot.sendMessage(
    session.chatId,
    '목표 시간 공복을 달성하셨습니다🎉\n대단해요👍\n\n이제 본인검수와 최종점수를 입력해 주세요.\n\n이벤트나 챌린지에 참여 중이라면 검수완료와 최종점수가 입력되어야 기록이 완성되고 참여 조건을 충족할 수 있습니다.\n\n점수 선택은 다른 사람에게 평가받기 위한 것이 아니라, 공복 여정을 돌아보는 메타인지 시간입니다. 여러분만의 전담코치라고 생각하고 잘 활용해 주세요.',
    reviewKeyboard
  );
}

async function sendFirstCheckin(bot, document, session) {
  await bot.sendMessage(
    session.chatId,
    '설정하신 체크 시간입니다.\n\n지금까지의 공복 여정에 점수를 주세요.',
    scoreKeyboard
  );

  await document.ref.update({
    firstReminderSentAt: new Date(),
    updatedAt: new Date()
  });
}

async function sendRepeatCheckin(bot, document, session) {
  await document.ref.update({ notificationLock: true, updatedAt: new Date() });

  try {
    await bot.sendMessage(
      session.chatId,
      '설정하신 체크 시간입니다.\n\n지금까지의 공복 여정에 점수를 주세요.',
      scoreKeyboard
    );

    await document.ref.update({
      lastReminderSentAt: new Date(),
      nextReminderAt: null,
      notificationLock: false,
      updatedAt: new Date()
    });
  } catch (error) {
    await document.ref.update({ notificationLock: false, updatedAt: new Date() });
    throw error;
  }
}

async function generateAllGroupSnapshots(db) {
  const usersSnapshot = await db.collection('users').get();
  const groupTags = new Set();

  for (const document of usersSnapshot.docs) {
    const groupTag = document.data().groupTag;
    if (groupTag) groupTags.add(String(groupTag));
  }

  const liveSnapshot = await db.collection('liveSessions').get();
  for (const document of liveSnapshot.docs) {
    const groupTag = document.data().groupTag;
    if (groupTag) groupTags.add(String(groupTag));
  }

  for (const groupTag of groupTags) {
    try {
      await generateGroupSnapshot(db, groupTag);
      console.log(`현황판 스냅샷 생성 완료 - group: ${groupTag}`);
    } catch (error) {
      console.error(`현황판 스냅샷 생성 오류 - group: ${groupTag}`, error.message);
    }
  }
}

function startReminderJob(bot, db) {
  let lastSnapshotAt = 0;
  const snapshotIntervalMs = BOARD_SNAPSHOT_MINUTES * 60 * 1000;

  console.log(`알림 작업 시작 - 첫 체크인: ${FIRST_CHECKIN_MINUTES}분`);
  console.log(`현황판 자동 갱신 시작 - ${BOARD_SNAPSHOT_MINUTES}분마다`);

  setInterval(async () => {
    try {
      const now = new Date();

      if (now.getTime() - lastSnapshotAt >= snapshotIntervalMs) {
        lastSnapshotAt = now.getTime();
        await generateAllGroupSnapshots(db);
      }

      const snapshot = await db
        .collection('liveSessions')
        .where('status', '==', 'active')
        .get();

      for (const document of snapshot.docs) {
        const session = document.data();
        const targetAt = toDate(session.targetAt);

        if (targetAt && now >= targetAt) {
          await completeSession(bot, db, document, session);
          continue;
        }

        if (session.notificationLock === true) continue;

        if (session.firstCheckDone !== true) {
          if (session.firstReminderSentAt) continue;
          const startedAt = toDate(session.startedAt);
          if (!startedAt) continue;

          const firstCheckinAt = new Date(
            startedAt.getTime() + FIRST_CHECKIN_MINUTES * 60 * 1000
          );

          if (now >= firstCheckinAt) {
            await sendFirstCheckin(bot, document, session);
          }
          continue;
        }

        if (session.alertsEnabled !== true || !session.nextReminderAt) continue;
        const nextReminderAt = toDate(session.nextReminderAt);

        if (nextReminderAt && now >= nextReminderAt) {
          await sendRepeatCheckin(bot, document, session);
        }
      }
    } catch (error) {
      console.error('알림 작업 오류:', error.message);
    }
  }, LOOP_INTERVAL_MS);
}

module.exports = {
  startReminderJob,
  toDate,
  generateAllGroupSnapshots
};
