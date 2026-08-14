require('dotenv').config();

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOARD_APP_URL = process.env.BOARD_APP_URL;
const FIRST_CHECKIN_MINUTES = Number(process.env.FIRST_CHECKIN_MINUTES || 120);
const BOARD_SNAPSHOT_MINUTES = Number(process.env.BOARD_SNAPSHOT_MINUTES || 30);
const FIREBASE_SERVICE_ACCOUNT_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.');
}

if (!/^https:\/\//i.test(BOARD_APP_URL || '')) {
  throw new Error('BOARD_APP_URL은 https:// 주소여야 합니다.');
}

if (!FIREBASE_SERVICE_ACCOUNT_BASE64) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64가 설정되지 않았습니다.');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(
    Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
  );
} catch (error) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64를 Firebase 서비스 계정 JSON으로 변환할 수 없습니다.');
}

const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount)
    });

const db = getFirestore(firebaseApp);
const app = express();

app.get('/', (_req, res) => {
  res.status(200).send('Fasting Telegram Bot is running.');
});

app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

app.get('/board', async (_req, res) => {
  try {
    const snapshot = await db.collection('fasting_users').get();
    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    res.status(200).send(`
      <!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>공복 현황판</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #222; }
            h1 { margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>공복 현황판</h1>
          <table>
            <thead>
              <tr><th>사용자</th><th>상태</th><th>시작 시간</th><th>목표 시간</th></tr>
            </thead>
            <tbody>
              ${users.length ? users.map((user) => `
                <tr>
                  <td>${escapeHtml(user.name || user.username || user.id)}</td>
                  <td>${escapeHtml(user.status || '-')}</td>
                  <td>${escapeHtml(formatDate(user.startedAt))}</td>
                  <td>${escapeHtml(formatDate(user.targetAt))}</td>
                </tr>
              `).join('') : '<tr><td colspan="4">등록된 사용자가 없습니다.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('현황판 조회 오류:', error);
    res.status(500).send('현황판을 불러오지 못했습니다.');
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '-';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString('ko-KR');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ko-KR');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP 서버 시작: ${PORT}`);
});

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
  console.error('Telegram polling 오류:', error.message);
});

bot.on('error', (error) => {
  console.error('Telegram 봇 오류:', error.message);
});

bot.on('message', async (message) => {
  if (!message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  try {
    if (text === '/start') {
      await bot.sendMessage(chatId, '공복 Telegram 봇을 시작합니다.', {
        reply_markup: {
          inline_keyboard: [[{ text: '공복 현황판 열기', web_app: { url: BOARD_APP_URL } }]]
        }
      });
      return;
    }

    if (text === '/health') {
      await bot.sendMessage(chatId, '봇이 정상적으로 실행 중입니다.');
      return;
    }

    if (text === '/status') {
      const doc = await db.collection('fasting_users').doc(String(chatId)).get();
      if (!doc.exists) {
        await bot.sendMessage(chatId, '등록된 공복 기록이 없습니다.');
        return;
      }

      const data = doc.data();
      await bot.sendMessage(chatId, `현재 상태: ${data.status || '-'}\n시작 시간: ${formatDate(data.startedAt)}\n목표 시간: ${formatDate(data.targetAt)}`);
    }
  } catch (error) {
    console.error('메시지 처리 오류:', error);
    await bot.sendMessage(chatId, '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
});

console.log('공복 Telegram 봇을 시작합니다.');
console.log(`알림 작업 시작 - 첫 체크인: ${FIRST_CHECKIN_MINUTES}분`);
console.log(`현황판 자동 갱신 시작 - ${BOARD_SNAPSHOT_MINUTES}분마다`);
