require('dotenv').config();

const { generateGroupSnapshot } = require('./boardService');

const FIRST_CHECKIN_MINUTES = Number(process.env.FIRST_CHECKIN_MINUTES || 120);
const BOARD_SNAPSHOT_MINUTES = Number(process.env.BOARD_SNAPSHOT_MINUTES || 30);
const LOOP_INTERVAL_MS = 15000;

const scoreKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '100??, callback_data: 'fast_score_100' },
        { text: '95??, callback_data: 'fast_score_95' }
      ],
      [
        { text: '90??, callback_data: 'fast_score_90' },
        { text: '80??, callback_data: 'fast_score_80' }
      ],
      [{ text: '?뚮┝ ?꾧린', callback_data: 'fast_alert_off' }],
      [{ text: '점수 선택 TIP', callback_data: 'fast_score_tip' }]
    ]
  }
};

const reviewKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '100??, callback_data: 'fast_review_100' },
        { text: '95??, callback_data: 'fast_review_95' }
      ],
      [
        { text: '90??, callback_data: 'fast_review_90' },
        { text: '80??, callback_data: 'fast_review_80' }
      ],
      [{ text: '?뚮┝ ?꾧린', callback_data: 'fast_alert_off' }]
    ]
  }
};

const completedKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '?ㅼ쓬 怨듬났 ?쒖옉', callback_data: 'fast_start' }],
      [{ text: '?꾪솴??蹂닿린', callback_data: 'fast_board' }],
      [{ text: '怨듭쑀?섍린', switch_inline_query: '怨듬났 紐⑺몴瑜??ъ꽦?덉뼱?뷃윃? }]
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
    '紐⑺몴 ?쒓컙 怨듬났???ъ꽦?섏뀲?듬땲?ㆀ윃?n??⑦빐?뷃윉?n\n?댁젣 蹂몄씤寃?섏? 理쒖쥌?먯닔瑜??낅젰??二쇱꽭??\n\n?대깽?몃굹 梨뚮┛吏??李몄뿬 以묒씠?쇰㈃ 寃?섏셿猷뚯? 理쒖쥌?먯닔媛 ?낅젰?섏뼱??湲곕줉???꾩꽦?섍퀬 李몄뿬 議곌굔??異⑹”?????덉뒿?덈떎.\n\n?먯닔 ?좏깮? ?ㅻⅨ ?щ엺?먭쾶 ?됯?諛쏄린 ?꾪븳 寃껋씠 ?꾨땲?? 怨듬났 ?ъ젙???뚯븘蹂대뒗 硫뷀??몄? ?쒓컙?낅땲?? ?щ윭遺꾨쭔???꾨떞肄붿튂?쇨퀬 ?앷컖?섍퀬 ???쒖슜??二쇱꽭??',
    reviewKeyboard
  );
}

async function sendFirstCheckin(bot, document, session) {
  await bot.sendMessage(
    session.chatId,
    '?ㅼ젙?섏떊 泥댄겕 ?쒓컙?낅땲??\n\n吏湲덇퉴吏??怨듬났 ?ъ젙???먯닔瑜?二쇱꽭??',
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
      '공복 시작 후 첫 체크인 시간입니다.\n\n점수 선택 팁을 참고하시거나\n여러분의 직관으로 하셔도 됩니다 :)',
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
      console.log(`?꾪솴???ㅻ깄???앹꽦 ?꾨즺 - group: ${groupTag}`);
    } catch (error) {
      console.error(`?꾪솴???ㅻ깄???앹꽦 ?ㅻ쪟 - group: ${groupTag}`, error.message);
    }
  }
}

function startReminderJob(bot, db) {
  let lastSnapshotAt = 0;
  const snapshotIntervalMs = BOARD_SNAPSHOT_MINUTES * 60 * 1000;

  console.log(`?뚮┝ ?묒뾽 ?쒖옉 - 泥?泥댄겕?? ${FIRST_CHECKIN_MINUTES}遺?);
  console.log(`?꾪솴???먮룞 媛깆떊 ?쒖옉 - ${BOARD_SNAPSHOT_MINUTES}遺꾨쭏??);

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
      console.error('?뚮┝ ?묒뾽 ?ㅻ쪟:', error.message);
    }
  }, LOOP_INTERVAL_MS);
}

module.exports = {
  startReminderJob,
  toDate,
  generateAllGroupSnapshots
};


