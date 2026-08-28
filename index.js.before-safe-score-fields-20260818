require('dotenv').config();

const path = require('path');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const app = express();
app.use(express.json());

app.use(express.static(__dirname, {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
  }
}));

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOARD_APP_URL = String(process.env.BOARD_APP_URL || '').replace(/\/$/, '');
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const FIRST_CHECKIN_MINUTES = Number(process.env.FIRST_CHECKIN_MINUTES || 120);
const BOARD_SNAPSHOT_MINUTES = Number(process.env.BOARD_SNAPSHOT_MINUTES || 30);

if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing.');
if (!/^https:\/\//i.test(BOARD_APP_URL)) throw new Error('BOARD_APP_URL must start with https://.');
if (!TELEGRAM_WEBHOOK_SECRET) throw new Error('TELEGRAM_WEBHOOK_SECRET is missing.');

function getServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is missing.');
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
}

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(getServiceAccount()) });

const db = getFirestore(firebaseApp);
const bot = new TelegramBot(TOKEN);
const draft = new Map();

const button = (text, callback_data) => ({ text, callback_data });
const keyboard = (inline_keyboard) => ({ inline_keyboard });

function webAppButton(chatId, group) {
  const url = new URL(BOARD_APP_URL);
  url.searchParams.set('chat_id', String(chatId));
  url.searchParams.set('group', String(group || '전체'));
  return { text: 'Board', web_app: { url: url.toString() } };
}

function minutesBetween(a, b) {
  const av = a?.toMillis ? a.toMillis() : new Date(a).getTime();
  const bv = b?.toMillis ? b.toMillis() : new Date(b).getTime();
  return Math.max(0, Math.floor((bv - av) / 60000));
}

function percent(session) {
  const start = session.startedAt?.toMillis ? session.startedAt.toMillis() : new Date(session.startedAt).getTime();
  const target = session.targetAt?.toMillis ? session.targetAt.toMillis() : new Date(session.targetAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(target) || target <= start) return 0;
  return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (target - start)) * 100)));
}

function progressMessage(session) {
  const elapsed = minutesBetween(session.startedAt, new Date());
  const remaining = Math.max(0, minutesBetween(new Date(), session.targetAt));
  let next = 'Alerts off';
  if (session.alertsEnabled !== false && session.nextReminderAt) {
    next = `${Math.max(0, minutesBetween(new Date(), session.nextReminderAt))} min`;
  }
  return `Fasting in progress.\n\nName: ${session.name}\nGroup: ${session.groupTag}\nGoal: ${session.targetHours} hours\n\nElapsed: ${Math.floor(elapsed / 60)} hours ${elapsed % 60} minutes\n\nRemaining: ${Math.floor(remaining / 60)} hours ${remaining % 60} minutes\n\nNext alert: ${next}`;
}

async function findSession(chatId) {
  const snap = await db.collection('liveSessions')
    .where('telegramChatId', '==', String(chatId))
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function sessionKeyboard(chatId, session) {
  return keyboard([
    [button('Progress', `progress:${session.id}`), webAppButton(chatId, session.groupTag)],
    [button('Stop fasting', `stop_confirm:${session.id}`), button('Alerts', `alerts:${session.id}`)]
  ]);
}

async function updateMessage(chatId, messageId, session) {
  try {
    await bot.editMessageText(progressMessage(session), {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: sessionKeyboard(chatId, session)
    });
  } catch (error) {
    if (!String(error.message).includes('message is not modified')) throw error;
  }
}

async function sendProgress(chatId, session) {
  return bot.sendMessage(chatId, progressMessage(session), {
    reply_markup: sessionKeyboard(chatId, session)
  });
}

async function saveTelegramUser(msg) {
  await db.collection('telegramUsers').doc(String(msg.from.id)).set({
    telegramUserId: String(msg.from.id),
    telegramChatId: String(msg.chat.id),
    telegramUsername: msg.from.username || null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

bot.onText(/^\/start$/, async (msg) => {
  try {
    await saveTelegramUser(msg);
    const existing = await findSession(msg.chat.id);
    if (existing) {
      await bot.sendMessage(msg.chat.id, `An active fasting session exists.\n\nGoal: ${existing.targetHours} hours\n\nContinue?`, {
        reply_markup: keyboard([
          [button('Continue', `resume:${existing.id}`)],
          [button('Stop and restart', `restart:${existing.id}`)]
        ])
      });
      return;
    }

    draft.set(String(msg.chat.id), {});
    await bot.sendMessage(msg.chat.id, 'Welcome to the fasting reminder.\n\nWe will track your fasting session and reminders.', {
      reply_markup: keyboard([
        [button('Start fasting', 'start_fasting')],
        [webAppButton(msg.chat.id)],
        [button('Help', 'help')]
      ])
    });
  } catch (error) {
    console.error('start handler error:', error);
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const state = draft.get(String(msg.chat.id));
  if (!state || state.step !== 'name') return;

  const parts = msg.text.trim().split('_');
  if (parts.length < 2 || !parts.at(-1) || !parts.slice(0, -1).join('_')) {
    await bot.sendMessage(msg.chat.id, 'Please enter the format name_group. Example: Messi_Seoul');
    return;
  }

  state.name = parts.slice(0, -1).join('_');
  state.groupTag = parts.at(-1);
  state.step = 'target';
  draft.set(String(msg.chat.id), state);

  await bot.sendMessage(msg.chat.id, `Name: ${state.name}\nGroup: ${state.groupTag}\n\nChoose fasting duration.`, {
    reply_markup: keyboard([
      [button('12 hours', 'target:12'), button('14 hours', 'target:14')],
      [button('16 hours', 'target:16'), button('18 hours', 'target:18')],
      [button('20 hours', 'target:20')]
    ])
  });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data || '';
  const state = draft.get(String(chatId)) || {};

  try {
    await bot.answerCallbackQuery(query.id);

    if (data === 'help') {
      await bot.sendMessage(chatId, 'Choose a fasting duration to record your session and reminders.');
      return;
    }

    if (data === 'start_fasting') {
      state.step = 'name';
      draft.set(String(chatId), state);
      await bot.sendMessage(chatId, 'Enter the display name in name_group format. Example: Messi_Seoul');
      return;
    }

    if (data.startsWith('target:')) {
      state.targetHours = Number(data.split(':')[1]);
      state.step = 'confirm';
      draft.set(String(chatId), state);
      await bot.editMessageText(`Name: ${state.name}\nGroup: ${state.groupTag}\nGoal: ${state.targetHours} hours\n\nStart fasting?`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard([
          [button('Start', 'confirm_start')],
          [button('Edit name', 'start_fasting')]
        ])
      });
      return;
    }

    if (data === 'confirm_start') {
      const startedAt = new Date();
      const targetAt = new Date(startedAt.getTime() + state.targetHours * 60 * 60 * 1000);
      const nextReminderAt = new Date(startedAt.getTime() + FIRST_CHECKIN_MINUTES * 60000);
      const ref = db.collection('liveSessions').doc(String(chatId));

      await ref.set({
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

      const session = { id: ref.id, ...(await ref.get()).data() };
      draft.delete(String(chatId));
      await bot.editMessageText(progressMessage(session), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: sessionKeyboard(chatId, session)
      });
      return;
    }

    if (data.startsWith('resume:')) {
      const session = await findSession(chatId);
      if (session) await sendProgress(chatId, session);
      return;
    }

    if (data.startsWith('restart:')) {
      const session = await findSession(chatId);
      if (session) await db.collection('liveSessions').doc(session.id).delete();
      draft.set(String(chatId), { step: 'name' });
      await bot.sendMessage(chatId, 'Starting a new fasting session. Enter name_group.');
      return;
    }

    if (data.startsWith('progress:')) {
      const session = await findSession(chatId);
      if (session) await updateMessage(chatId, messageId, session);
      return;
    }

    if (data.startsWith('alerts:')) {
      const session = await findSession(chatId);
      if (!session) return;
      await bot.editMessageReplyMarkup(keyboard([
        [button('30 minutes', `alert:30:${session.id}`), button('1 hour', `alert:60:${session.id}`)],
        [button('2 hours', `alert:120:${session.id}`)],
        [button('Disable alerts', `alert:off:${session.id}`)]
      ]), { chat_id: chatId, message_id: messageId });
      return;
    }

    if (data.startsWith('alert:')) {
      const [, value, sessionId] = data.split(':');
      const session = await findSession(chatId);
      if (!session || session.id !== sessionId) return;
      const ref = db.collection('liveSessions').doc(session.id);

      if (value === 'off') {
        await ref.update({ alertsEnabled: false, nextReminderAt: null, updatedAt: FieldValue.serverTimestamp() });
      } else {
        const minutes = Number(value);
        await ref.update({ alertsEnabled: true, reminderMinutes: minutes, nextReminderAt: new Date(Date.now() + minutes * 60000), updatedAt: FieldValue.serverTimestamp() });
      }

      const updated = await findSession(chatId);
      await updateMessage(chatId, messageId, updated);
      return;
    }

    if (data.startsWith('stop_confirm:')) {
      const session = await findSession(chatId);
      if (!session) return;
      await bot.editMessageReplyMarkup(keyboard([
        [button('Continue', `resume:${session.id}`)],
        [button('Stop', `stop:${session.id}`)]
      ]), { chat_id: chatId, message_id: messageId });
      return;
    }

    if (data.startsWith('stop:')) {
      const session = await findSession(chatId);
      if (session) await db.collection('liveSessions').doc(session.id).delete();
      await bot.editMessageText('Fasting session ended.', { chat_id: chatId, message_id: messageId });
    }
  } catch (error) {
    console.error('callback handler error:', error);
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/board.js', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'board.js'));
});

app.get('/board.css', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.type('text/css');
  res.sendFile(path.join(__dirname, 'board.css'));
});

app.get('/board', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'board.html'));
});

app.get('/api/board', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  try {
    const group = String(req.query.group || '');
    if (!group) return res.status(400).json({ error: 'group query parameter is required' });

    const snap = await db.collection('liveSessions')
      .where('groupTag', '==', group)
      .where('status', '==', 'active')
      .get();

    const now = Date.now();
    const rows = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((session) => {
        const expires = session.expiresAt?.toMillis ? session.expiresAt.toMillis() : new Date(session.expiresAt).getTime();
        return !Number.isFinite(expires) || expires > now;
      })
      .sort((a, b) => percent(b) - percent(a));

    res.json({
      group,
      rows: rows.map((session, index) => ({
        rank: index + 1,
        name: session.name,
        targetHours: session.targetHours,
        progressPercent: percent(session)
      }))
    });
  } catch (error) {
    console.error('/api/board error:', error);
    res.status(500).json({ error: 'Unable to load board.' });
  }
});

app.post('/telegram/webhook', (req, res) => {
  const receivedSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (receivedSecret !== TELEGRAM_WEBHOOK_SECRET) return res.sendStatus(403);
  res.sendStatus(200);
  bot.processUpdate(req.body);
});

console.log('BOOT FILE: index.js');
console.log('WEBHOOK MODE: enabled');
console.log('RAILWAY COMMIT:', process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown');
console.log('PORT:', PORT);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server started: ${PORT}`);
  console.log('Fasting Telegram bot started.');
  console.log('Webhook endpoint: /telegram/webhook');
  console.log(`First check-in reminder: ${FIRST_CHECKIN_MINUTES} minutes`);
  console.log(`Board snapshot interval: ${BOARD_SNAPSHOT_MINUTES} minutes`);
});