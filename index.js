require('dotenv').config();

const path = require('path');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOARD_APP_URL = String(process.env.BOARD_APP_URL || '').replace(/\/$/, '');
const FIRST_CHECKIN_MINUTES = Number(process.env.FIRST_CHECKIN_MINUTES || 120);
const BOARD_SNAPSHOT_MINUTES = Number(process.env.BOARD_SNAPSHOT_MINUTES || 30);

if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN이 없습니다.');
if (!/^https:\/\//i.test(BOARD_APP_URL)) {
  throw new Error('BOARD_APP_URL은 https:// 주소여야 합니다.');
}

function getServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64가 없습니다.');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount())
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const bot = new TelegramBot(TOKEN, { polling: true });
const draft = new Map();

const button = (text, callbackData) => ({
  text,
  callback_data: callbackData
});

const keyboard = (inlineKeyboard) => ({
  inline_keyboard: inlineKeyboard
});

function boardUrl(group) {
  const url = new URL(BOARD_APP_URL);
  if (group) url.searchParams.set('group', String(group));
  return url.toString();
}

function webAppButton(group) {
  return {
    text: '현황판 열기',
    web_app: {
      url: boardUrl(group)
    }
  };
}

async function setBoardMenuButton(chatId, group) {
  return bot.setChatMenuButton({
    chat_id: chatId,
    menu_button: {
      type: 'web_app',
      text: '현황판',
      web_app: {
        url: boardUrl(group)
      }
    }
  });
}

function toMillis(value) {
  if (!value) return NaN;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function minutesBetween(from, to) {
  const fromMs = toMillis(from);
  const toMs = toMillis(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.max(0, Math.floor((toMs - fromMs) / 60000));
}

function progressPercent(session) {
  const start = toMillis(session.startedAt);
  const target = toMillis(session.targetAt);
  if (!Number.isFinite(start) || !Number.isFinite(target) || target <= start) return 0;
  return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (target - start)) * 100)));
}

function progressMessage(session) {
  const elapsed = minutesBetween(session.startedAt, new Date());
  const remaining = Math.max(0, minutesBetween(new Date(), session.targetAt));
  let nextReminder = '알림 꺼짐';

  if (session.alertsEnabled !== false && session.nextReminderAt) {
    nextReminder = `${minutesBetween(new Date(), session.nextReminderAt)}분`;
  }

  return [
    '공복 진행 중입니다.',
    '',
    `이름: ${session.name}`,
    `그룹: ${session.groupTag}`,
    `목표시간: ${session.targetHours}시간`,
    '',
    `현재 ${Math.floor(elapsed / 60)}시간 ${elapsed % 60}분째 공복 진행 중입니다.`,
    '',
    `목표시간까지 ${Math.floor(remaining / 60)}시간 ${remaining % 60}분 남았습니다.`,
    '',
    `다음 알림까지: ${nextReminder}`
  ].join('\n');
}

function progressKeyboard(chatId, session) {
  return keyboard([
    [
      button('진행상황', `progress:${session.id}`),
      webAppButton(session.groupTag)
    ],
    [
      button('공복중지', `stop_confirm:${session.id}`),
      button('알림 설정', `alerts:${session.id}`)
    ]
  ]);
}

async function findSession(chatId) {
  const snapshot = await db.collection('liveSessions')
    .where('telegramChatId', '==', String(chatId))
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

async function saveTelegramUser(message) {
  await db.collection('telegramUsers').doc(String(message.from.id)).set({
    telegramUserId: String(message.from.id),
    telegramChatId: String(message.chat.id),
    telegramUsername: message.from.username || null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function updateProgressMessage(chatId, messageId, session) {
  try {
    await bot.editMessageText(progressMessage(session), {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: progressKeyboard(chatId, session)
    });
  } catch (error) {
    if (!String(error.message).includes('message is not modified')) {
      throw error;
    }
  }
}

async function sendProgressMessage(chatId, session) {
  await setBoardMenuButton(chatId, session.groupTag);
  return bot.sendMessage(chatId, progressMessage(session), {
    reply_markup: progressKeyboard(chatId, session)
  });
}

bot.onText(/^\/start$/, async (message) => {
  try {
    await saveTelegramUser(message);
    await setBoardMenuButton(message.chat.id);

    const existing = await findSession(message.chat.id);

    if (existing) {
      await bot.sendMessage(
        message.chat.id,
        [
          '진행 중인 공복이 있습니다.',
          '',
          `목표시간: ${existing.targetHours}시간`,
          '',
          '기존 공복을 이어서 진행하시겠습니까?'
        ].join('\n'),
        {
          reply_markup: keyboard([
            [button('이어서 진행', `resume:${existing.id}`)],
            [button('중지하고 새로 시작', `restart:${existing.id}`)]
          ])
        }
      );
      return;
    }

    draft.set(String(message.chat.id), {});

    await bot.sendMessage(
      message.chat.id,
      '안녕하세요. 공복 리마인더입니다.\n\n공복 시작부터 체크인, 목표 달성까지 함께 기록해 드릴게요.',
      {
        reply_markup: keyboard([
          [button('공복 시작하기', 'start_fasting')],
          [webAppButton()],
          [button('사용 방법', 'help')]
        ])
      }
    );
  } catch (error) {
    console.error('/start 오류:', error);
  }
});

bot.on('message', async (message) => {
  if (!message.text || message.text.startsWith('/')) return;

  const state = draft.get(String(message.chat.id));
  if (!state || state.step !== 'name') return;

  const parts = message.text.trim().split('_');
  const name = parts.slice(0, -1).join('_');
  const group = parts.at(-1);

  if (parts.length < 2 || !name || !group) {
    await bot.sendMessage(
      message.chat.id,
      '이름_그룹명 형식으로 입력해 주세요.\n\n예: 홍길동_여수'
    );
    return;
  }

  state.name = name;
  state.groupTag = group;
  state.step = 'target';
  draft.set(String(message.chat.id), state);

  await bot.sendMessage(
    message.chat.id,
    `이름: ${state.name}\n그룹: ${state.groupTag}\n\n공복 시간을 선택해 주세요.`,
    {
      reply_markup: keyboard([
        [button('12시간', 'target:12'), button('14시간', 'target:14')],
        [button('16시간', 'target:16'), button('18시간', 'target:18')],
        [button('20시간', 'target:20')]
      ])
    }
  );
});

bot.on('callback_query', async (query) => {
  if (!query.message) return;

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data || '';
  const state = draft.get(String(chatId)) || {};

  await bot.answerCallbackQuery(query.id);

  try {
    if (data === 'help') {
      await bot.sendMessage(
        chatId,
        '공복 시간을 선택하면 시작 시각부터 체크인과 목표 달성까지 기록하고 알려드립니다.'
      );
      return;
    }

    if (data === 'start_fasting') {
      state.step = 'name';
      draft.set(String(chatId), state);
      await bot.sendMessage(
        chatId,
        '현황판에 표시할 이름을 입력해 주세요.\n이름 뒤에 _그룹명을 붙여 주세요.\n\n예: 홍길동_여수'
      );
      return;
    }

    if (data.startsWith('target:')) {
      state.targetHours = Number(data.split(':')[1]);
      state.step = 'confirm';
      draft.set(String(chatId), state);

      await bot.editMessageText(
        `이름: ${state.name}\n그룹: ${state.groupTag}\n목표시간: ${state.targetHours}시간\n\n공복을 시작할까요?`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard([
            [button('공복 시작', 'confirm_start')],
            [button('이름 수정', 'start_fasting')]
          ])
        }
      );
      return;
    }

    if (data === 'confirm_start') {
      if (!state.name || !state.groupTag || !state.targetHours) {
        await bot.sendMessage(chatId, '공복 정보를 찾지 못했습니다. /start를 다시 실행해 주세요.');
        return;
      }

      const startedAt = new Date();
      const targetAt = new Date(startedAt.getTime() + state.targetHours * 60 * 60 * 1000);
      const nextReminderAt = new Date(startedAt.getTime() + FIRST_CHECKIN_MINUTES * 60000);
      const reference = db.collection('liveSessions').doc(String(chatId));

      await reference.set({
        telegramChatId: String(chatId),
        telegramUserId: String(query.from.id),
        name: state.name,
        groupTag: state.groupTag,
        targetHours: state.targetHours,
        startedAt,
        targetAt,
        expiresAt: targetAt,
        status: 'active',
        firstCheckDone: false,
        alertsEnabled: true,
        reminderMinutes: FIRST_CHECKIN_MINUTES,
        nextReminderAt,
        updatedAt: FieldValue.serverTimestamp()
      });

      const session = {
        id: reference.id,
        ...(await reference.get()).data()
      };

      draft.delete(String(chatId));
      await setBoardMenuButton(chatId, session.groupTag);

      await bot.editMessageText(progressMessage(session), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: progressKeyboard(chatId, session)
      });
      return;
    }

    if (data.startsWith('resume:')) {
      const session = await findSession(chatId);
      if (session) await sendProgressMessage(chatId, session);
      return;
    }

    if (data.startsWith('restart:')) {
      const session = await findSession(chatId);
      if (session) await db.collection('liveSessions').doc(session.id).delete();
      draft.set(String(chatId), { step: 'name' });
      await bot.sendMessage(chatId, '새 공복을 시작합니다.\n\n이름_그룹명 형식으로 입력해 주세요.');
      return;
    }

    if (data.startsWith('progress:')) {
      const session = await findSession(chatId);
      if (session) await updateProgressMessage(chatId, messageId, session);
      return;
    }

    if (data.startsWith('alerts:')) {
      const session = await findSession(chatId);
      if (!session) return;

      await bot.editMessageReplyMarkup(
        keyboard([
          [button('30분 뒤', `alert:30:${session.id}`), button('1시간 뒤', `alert:60:${session.id}`)],
          [button('2시간 뒤', `alert:120:${session.id}`)],
          [button('알림 끄기', `alert:off:${session.id}`)]
        ]),
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    if (data.startsWith('alert:')) {
      const [, value, sessionId] = data.split(':');
      const session = await findSession(chatId);
      if (!session || session.id !== sessionId) return;

      const reference = db.collection('liveSessions').doc(session.id);

      if (value === 'off') {
        await reference.update({
          alertsEnabled: false,
          nextReminderAt: null,
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        const minutes = Number(value);
        await reference.update({
          alertsEnabled: true,
          reminderMinutes: minutes,
          nextReminderAt: new Date(Date.now() + minutes * 60000),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      const updated = await findSession(chatId);
      await updateProgressMessage(chatId, messageId, updated);
      return;
    }

    if (data.startsWith('stop_confirm:')) {
      const session = await findSession(chatId);
      if (!session) return;

      await bot.editMessageReplyMarkup(
        keyboard([
          [button('계속 진행', `resume:${session.id}`)],
          [button('종료하기', `stop:${session.id}`)]
        ]),
        { chat_id: chatId, message_id: messageId }
      );
      return;
    }

    if (data.startsWith('stop:')) {
      const session = await findSession(chatId);
      if (session) await db.collection('liveSessions').doc(session.id).delete();

      await bot.editMessageText(
        '공복을 종료했습니다.\n\n다음 공복이 필요할 때 다시 시작해 주세요.',
        { chat_id: chatId, message_id: messageId }
      );
    }
  } catch (error) {
    console.error('콜백 처리 오류:', error);
  }
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/board', (req, res) => {
  res.sendFile(path.join(__dirname, 'board.html'), (error) => {
    if (error) {
      console.error('board.html 제공 오류:', error);
      if (!res.headersSent) res.status(404).send('board.html을 찾을 수 없습니다.');
    }
  });
});

app.get('/api/board', async (req, res) => {
  try {
    const group = String(req.query.group || '');
    if (!group) {
      res.status(400).json({ error: 'group query parameter is required' });
      return;
    }

    const snapshot = await db.collection('liveSessions')
      .where('groupTag', '==', group)
      .where('status', '==', 'active')
      .get();

    const now = Date.now();
    const rows = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((session) => {
        const expiresAt = toMillis(session.expiresAt);
        return !Number.isFinite(expiresAt) || expiresAt > now;
      })
      .sort((a, b) => progressPercent(b) - progressPercent(a));

    res.json({
      group,
      rows: rows.map((session, index) => ({
        rank: index + 1,
        name: session.name,
        targetHours: session.targetHours,
        progressPercent: progressPercent(session)
      }))
    });
  } catch (error) {
    console.error('/api/board 오류:', error);
    res.status(500).json({ error: '현황판을 불러오지 못했습니다.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP 서버 시작: ${PORT}`);
});

console.log(`알림 작업 시작 - 첫 체크인: ${FIRST_CHECKIN_MINUTES}분`);
console.log(`현황판 자동 갱신 시작 - ${BOARD_SNAPSHOT_MINUTES}분마다`);
console.log('공복 Telegram 봇을 시작합니다.');
console.log('봇 연결 성공: @jerobok_bot');
