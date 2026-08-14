require('dotenv').config();

const { TelegramBot } = require('node-telegram-bot-api');
const { db } = require('./firebase');
const { startReminderJob } = require('./reminderJob');
const {
  getBoardEntries,
  buildBoardMessage
} = require('./boardService');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN이 없습니다.');

const bot = new TelegramBot(token, { polling: true });
const userStates = new Map();
const boardMessages = new Map();

const mainKeyboard = {
  reply_markup: { inline_keyboard: [
    [{ text: '공복 시작하기', callback_data: 'fast_start' }],
    [
      { text: '현황판 보기', callback_data: 'fast_board' },
      { text: '사용 방법', callback_data: 'fast_help' }
    ]
  ] }
};

const targetHoursKeyboard = {
  reply_markup: { inline_keyboard: [
    [
      { text: '12시간', callback_data: 'fast_hours_12' },
      { text: '14시간', callback_data: 'fast_hours_14' }
    ],
    [
      { text: '16시간', callback_data: 'fast_hours_16' },
      { text: '18시간', callback_data: 'fast_hours_18' }
    ],
    [{ text: '20시간', callback_data: 'fast_hours_20' }]
  ] }
};

const fastingKeyboard = {
  reply_markup: { inline_keyboard: [
    [
      { text: '진행상황', callback_data: 'fast_progress' },
      { text: '현황판', callback_data: 'fast_board' }
    ],
    [{ text: '공복중지', callback_data: 'fast_stop' }]
  ] }
};

const resumeKeyboard = {
  reply_markup: { inline_keyboard: [
    [{ text: '이어서 진행', callback_data: 'fast_resume' }],
    [{ text: '중지하고 새로 시작', callback_data: 'fast_restart' }]
  ] }
};

const stopKeyboard = {
  reply_markup: { inline_keyboard: [
    [
      { text: '계속 진행', callback_data: 'fast_stop_cancel' },
      { text: '종료하기', callback_data: 'fast_stop_confirm' }
    ]
  ] }
};

const nextReminderKeyboard = {
  reply_markup: { inline_keyboard: [
    [
      { text: '30분 뒤', callback_data: 'fast_next_30' },
      { text: '1시간 뒤', callback_data: 'fast_next_60' }
    ],
    [{ text: '2시간 뒤', callback_data: 'fast_next_120' }],
    [{ text: '알림 끄기', callback_data: 'fast_alert_off' }]
  ] }
};

const scoreKeyboard = {
  reply_markup: { inline_keyboard: [
    [
      { text: '100점', callback_data: 'fast_score_100' },
      { text: '95점', callback_data: 'fast_score_95' }
    ],
    [
      { text: '90점', callback_data: 'fast_score_90' },
      { text: '80점', callback_data: 'fast_score_80' }
    ],
    [{ text: '알림 끄기', callback_data: 'fast_alert_off' }]
  ] }
};

function userIdFromMessage(message) {
  return String(message.from.id);
}

function userIdFromQuery(query) {
  return String(query.from.id);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function reminderText(session) {
  if (session.alertsEnabled !== true) return '알림 꺼짐';
  if (session.reminderMinutes === 30) return '30분 뒤';
  if (session.reminderMinutes === 60) return '1시간 뒤';
  if (session.reminderMinutes === 120) return '2시간 뒤';
  return '첫 체크는 2시간 후';
}

function reminderToggle(session) {
  return session.alertsEnabled === true
    ? { text: '알림 끄기', callback_data: 'fast_alert_off' }
    : { text: '알림 켜기', callback_data: 'fast_alert_on' };
}

function progressKeyboard(session) {
  return {
    reply_markup: { inline_keyboard: [
      [
        { text: '진행상황', callback_data: 'fast_progress' },
        { text: '현황판', callback_data: 'fast_board' }
      ],
      [reminderToggle(session)],
      [{ text: '공복중지', callback_data: 'fast_stop' }]
    ] }
  };
}

function saveUser(message) {
  const userId = userIdFromMessage(message);
  return db.collection('users').doc(userId).set({
    telegramUserId: userId,
    telegramChatId: String(message.chat.id),
    telegramUsername: message.from.username || null,
    updatedAt: new Date()
  }, { merge: true }).then(() => userId);
}

async function getSession(userId) {
  const snapshot = await db.collection('liveSessions').doc(userId).get();
  return snapshot.exists ? snapshot.data() : null;
}

bot.onText(/^\/start$/, async (message) => {
  const chatId = message.chat.id;
  const userId = userIdFromMessage(message);

  try {
    await saveUser(message);
    const session = await getSession(userId);
    const expiresAt = session && toDate(session.expiresAt);

    if (session && session.status === 'active' && expiresAt > new Date()) {
      userStates.set(chatId, { step: 'fasting_active' });
      await bot.sendMessage(chatId,
        `진행 중인 공복이 있습니다.\n\n목표시간: ${session.targetHours}시간\n시작시각: ${toDate(session.startedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n\n기존 공복을 이어서 진행하시겠습니까?`,
        resumeKeyboard);
      return;
    }

    await bot.sendMessage(chatId,
      `안녕하세요. 공복마스터입니다.\n\n공복 시작부터 체크인, 목표 달성까지\n함께 기록해 드릴게요.`,
      mainKeyboard);
  } catch (error) {
    console.error('/start 오류:', error.message);
    await bot.sendMessage(chatId, '사용자 정보를 확인하지 못했습니다.');
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const userId = userIdFromQuery(query);

  try {
    await bot.answerCallbackQuery(query.id);

    if (action === 'fast_start') {
      userStates.set(chatId, { step: 'awaiting_name' });
      await bot.sendMessage(chatId, '공복 여정을 시작해 볼까요?\n\n현황판에 표시할 이름을 입력해 주세요.\n이름 뒤에 _그룹명을 붙여 주세요.\n\n예: 홍길동_여수');
      return;
    }

    if (action === 'fast_resume') {
      const session = await getSession(userId);
      if (!session) return bot.sendMessage(chatId, '진행 중인 공복을 찾지 못했습니다.', mainKeyboard);
      await bot.sendMessage(chatId, `기존 공복을 이어서 진행합니다.\n\n이름: ${session.name}\n그룹: ${session.groupTag}\n목표시간: ${session.targetHours}시간\n\n지금까지 잘 진행하고 있어요.`, progressKeyboard(session));
      return;
    }

    if (action === 'fast_restart') {
      await db.collection('liveSessions').doc(userId).delete();
      await bot.sendMessage(chatId, '기존 공복을 중지했습니다.\n\n새로운 공복 여정을 시작해 볼까요?', mainKeyboard);
      return;
    }

    if (action.startsWith('fast_hours_')) {
      const state = userStates.get(chatId);
      const targetHours = Number(action.replace('fast_hours_', ''));
      if (!state || !state.name) return bot.sendMessage(chatId, '먼저 이름을 입력해 주세요.');
      userStates.set(chatId, { ...state, targetHours, step: 'awaiting_confirmation' });
      await bot.sendMessage(chatId, `이름: ${state.name}\n그룹: ${state.groupTag}\n목표시간: ${targetHours}시간\n\n공복을 시작할까요?`, {
        reply_markup: { inline_keyboard: [
          [{ text: '공복 시작', callback_data: 'fast_confirm_start' }],
          [{ text: '이름 수정', callback_data: 'fast_edit_name' }]
        ] }
      });
      return;
    }

    if (action === 'fast_edit_name') {
      userStates.set(chatId, { step: 'awaiting_name' });
      await bot.sendMessage(chatId, '현황판에 표시할 이름을 다시 입력해 주세요.\n\n예: 홍길동_여수');
      return;
    }

    if (action === 'fast_confirm_start') {
      const state = userStates.get(chatId);
      if (!state || !state.targetHours) return bot.sendMessage(chatId, '공복 정보를 찾지 못했습니다.');
      const startedAt = new Date();
      const targetAt = new Date(startedAt.getTime() + state.targetHours * 3600000);
      await db.collection('liveSessions').doc(userId).set({
        userId, telegramUserId: userId, chatId: String(chatId),
        name: state.name, displayName: state.name, groupTag: state.groupTag,
        targetHours: state.targetHours, startedAt, targetAt, expiresAt: targetAt,
        status: 'active', firstCheckDone: false, alertsEnabled: true,
        reminderMinutes: 0, nextReminderAt: null, firstReminderSentAt: null,
        lastReminderSentAt: null, notificationLock: false,
        createdAt: startedAt, updatedAt: startedAt
      });
      const session = await getSession(userId);
      await bot.sendMessage(chatId, `공복 진행 중입니다.\n\n이름: ${state.name}\n그룹: ${state.groupTag}\n목표시간: ${state.targetHours}시간\n\n체크알림: 첫 체크는 2시간 후`, progressKeyboard(session));
      return;
    }

    if (action.startsWith('fast_score_')) {
      const score = Number(action.replace('fast_score_', ''));
      const session = await getSession(userId);
      if (!session) return bot.sendMessage(chatId, '진행 중인 공복을 찾지 못했습니다.');
      await db.collection('checkIns').add({
        userId, telegramUserId: userId, chatId: String(chatId), sessionId: userId,
        name: session.name, groupTag: session.groupTag,
        sessionStartedAt: session.startedAt, checkedAt: new Date(), score,
        stage: session.firstCheckDone ? 'repeat' : 'twoHour', createdAt: new Date()
      });
      await db.collection('liveSessions').doc(userId).update({ firstCheckDone: true, lastScore: score, lastCheckedAt: new Date(), updatedAt: new Date() });
      await bot.sendMessage(chatId, `점수 ${score}점을 저장했습니다.\n\n지금까지 잘 진행하고 있어요.\n\n다음 체크 알림을 선택해 주세요.`, nextReminderKeyboard);
      return;
    }

    if (action.startsWith('fast_review_')) {
      const score = Number(action.replace('fast_review_', ''));
      await db.collection('completedSessions').doc(userId).set({
        selfReviewStatus: 'completed', selfReviewScore: score,
        selfReviewedAt: new Date(), updatedAt: new Date()
      }, { merge: true });
      await bot.sendMessage(chatId, `본인 검수 ${score}점을 저장했습니다.\n\n오늘의 공복 여정을 잘 마무리했어요.`);
      return;
    }

    if (action.startsWith('fast_next_')) {
      const reminderMinutes = Number(action.replace('fast_next_', ''));
      await db.collection('liveSessions').doc(userId).update({
        alertsEnabled: true, reminderMinutes,
        nextReminderAt: new Date(Date.now() + reminderMinutes * 60000),
        notificationLock: false, updatedAt: new Date()
      });
      const label = reminderMinutes === 30 ? '30분 뒤' : reminderMinutes === 60 ? '1시간 뒤' : '2시간 뒤';
      await bot.sendMessage(chatId, `체크알림을 ${label}로 설정했습니다.\n\n목표 시간까지 함께 하겠습니다.`, fastingKeyboard);
      return;
    }

    if (action === 'fast_alert_off') {
      await db.collection('liveSessions').doc(userId).update({ alertsEnabled: false, nextReminderAt: null, reminderMinutes: 0, updatedAt: new Date() });
      const session = await getSession(userId);
      await bot.sendMessage(chatId, '체크알림을 껐습니다.\n\n현재 공복은 계속 진행됩니다.', progressKeyboard(session));
      return;
    }

    if (action === 'fast_alert_on') {
      const session = await getSession(userId);
      if (!session || !session.reminderMinutes) {
        await bot.sendMessage(chatId, '다음 체크 알림을 선택해 주세요.', nextReminderKeyboard);
        return;
      }
      await db.collection('liveSessions').doc(userId).update({ alertsEnabled: true, nextReminderAt: new Date(Date.now() + session.reminderMinutes * 60000), updatedAt: new Date() });
      await bot.sendMessage(chatId, '체크알림을 다시 켰습니다.\n\n목표 시간까지 함께 하겠습니다.', progressKeyboard({ ...session, alertsEnabled: true }));
      return;
    }

    if (action === 'fast_progress') {
      const session = await getSession(userId);
      if (!session) return bot.sendMessage(chatId, '진행 중인 공복을 찾지 못했습니다.', mainKeyboard);
      const startedAt = toDate(session.startedAt);
      const targetAt = toDate(session.targetAt);
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60000));
      const remain = Math.max(0, Math.ceil((targetAt.getTime() - Date.now()) / 60000));
      const total = session.targetHours * 60;
      const percent = Math.min(100, Math.floor((elapsed / total) * 100));
      await bot.sendMessage(chatId, `현재 ${Math.floor(elapsed / 60)}시간 ${elapsed % 60}분째 공복 진행 중입니다.\n\n목표시간까지 ${Math.floor(remain / 60)}시간 ${remain % 60}분 남았습니다.\n\n진행률: ${percent}%\n체크알림: ${reminderText(session)}`, progressKeyboard(session));
      return;
    }

    if (action === 'fast_stop') return bot.sendMessage(chatId, '공복을 종료할까요?\n\n목표시간 전에 종료하면 완료자 목록에 표시되지 않습니다.', stopKeyboard);
    if (action === 'fast_stop_cancel') return bot.sendMessage(chatId, '공복을 계속 진행합니다.', fastingKeyboard);
    if (action === 'fast_stop_confirm') {
      await db.collection('liveSessions').doc(userId).delete();
      await bot.sendMessage(chatId, '공복을 종료했습니다.', mainKeyboard);
      return;
    }

    if (action === 'fast_board') {
      const userSnapshot = await db.collection('users').doc(userId).get();
      if (!userSnapshot.exists) return bot.sendMessage(chatId, '먼저 이름과 그룹을 등록해 주세요.');
      const groupTag = userSnapshot.data().groupTag;
      const board = await getBoardEntries(db, groupTag, userId);
      const text = buildBoardMessage(board);
      const old = boardMessages.get(chatId);
      if (old) {
        await bot.editMessageText(text, { chat_id: chatId, message_id: old, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '새로고침', callback_data: 'fast_board' }], [{ text: '진행 화면으로 돌아가기', callback_data: 'fast_progress' }]] } });
      } else {
        const sent = await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '새로고침', callback_data: 'fast_board' }], [{ text: '진행 화면으로 돌아가기', callback_data: 'fast_progress' }]] } });
        boardMessages.set(chatId, sent.message_id);
      }
      return;
    }

    if (action === 'fast_help') {
      await bot.sendMessage(chatId, '공복마스터 사용 방법\n\n1. 공복 시작하기를 선택해 주세요.\n2. 이름_그룹명 형식으로 입력해 주세요.\n3. 목표 공복 시간을 선택해 주세요.\n4. 공복 중 체크인과 알림을 확인해 주세요.');
    }
  } catch (error) {
    console.error('버튼 처리 오류:', error.message);
  }
});

bot.on('message', async (message) => {
  const text = message.text?.trim();
  if (!text || text.startsWith('/')) return;
  const state = userStates.get(message.chat.id);
  if (!state || state.step !== 'awaiting_name') return;

  const index = text.lastIndexOf('_');
  const name = index >= 0 ? text.slice(0, index).trim() : '';
  const groupTag = index >= 0 ? text.slice(index + 1).trim() : '';

  if (!name || !groupTag) {
    await bot.sendMessage(message.chat.id, '입력 형식을 확인해 주세요.\n\n예: 홍길동_여수');
    return;
  }

  const userId = await saveUser(message);
  await db.collection('users').doc(userId).set({ name, displayName: name, groupTag, notificationsEnabled: true, telegramLinkedAt: new Date(), updatedAt: new Date() }, { merge: true });
  userStates.set(message.chat.id, { step: 'awaiting_target_hours', name, groupTag });
  await bot.sendMessage(message.chat.id, `이름: ${name}\n그룹: ${groupTag}\n\n공복 목표 시간을 선택해 주세요.`, targetHoursKeyboard);
});

bot.on('polling_error', (error) => console.error('Telegram polling 오류:', error.message));
bot.getMe().then((user) => console.log(`봇 연결 성공: @${user.username}`));
startReminderJob(bot, db);
