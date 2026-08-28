const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

function toMillis(value) {
  if (!value) return NaN;
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return new Date(value).getTime();
}

async function sendTelegramMessage(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN.value();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is empty");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "100점",
                callback_data: "score:100"
              },
              {
                text: "95점",
                callback_data: "score:95"
              }
            ],
            [
              {
                text: "90점",
                callback_data: "score:90"
              },
              {
                text: "80점",
                callback_data: "score:80"
              }
            ]
          ]
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      `Telegram API error: ${response.status} ${JSON.stringify(result)}`
    );
  }

  return result;
}

exports.processReminder = onRequest(
  {
    region: "asia-northeast3",
    secrets: [TELEGRAM_BOT_TOKEN],
    maxInstances: 1
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { sessionId } = req.body || {};

    if (!sessionId) {
      res.status(400).json({
        ok: false,
        error: "sessionId is required"
      });
      return;
    }

    try {
      const ref = db
        .collection("liveSessions")
        .doc(String(sessionId));

      const snap = await ref.get();

      if (!snap.exists) {
        res.status(200).json({
          ok: true,
          skipped: "session_not_found"
        });
        return;
      }

      const session = snap.data();
      const now = Date.now();
      const reminderAt = toMillis(session.nextReminderAt);

      if (session.status !== "active") {
        res.status(200).json({
          ok: true,
          skipped: "not_active"
        });
        return;
      }

      if (session.alertsEnabled === false) {
        res.status(200).json({
          ok: true,
          skipped: "alerts_disabled"
        });
        return;
      }

      if (!Number.isFinite(reminderAt) || reminderAt > now) {
        res.status(200).json({
          ok: true,
          skipped: "not_due",
          reminderAt,
          now
        });
        return;
      }

      const first = session.firstCheckDone !== true;

      const text = first
        ? "공복 시작 후 첫 체크인 시간입니다.\n현재 상태에 가까운 점수를 선택해 주세요."
        : "공복 진행 상황을 확인해 주세요.\n현재 상태에 가까운 점수를 선택해 주세요.";

      await sendTelegramMessage(
        session.telegramChatId,
        text
      );

      await ref.update({
        firstCheckDone: true,
        nextReminderAt: null,
        firstReminderSentAt: first
          ? admin.firestore.FieldValue.serverTimestamp()
          : session.firstReminderSentAt ||
            admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log("Cloud reminder sent", {
        sessionId,
        chatId: session.telegramChatId,
        first
      });

      res.status(200).json({
        ok: true,
        sent: true,
        first
      });
    } catch (error) {
      console.error("processReminder error", {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }
);

const { onSchedule } = require("firebase-functions/v2/scheduler");

exports.processDueReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
    secrets: [TELEGRAM_BOT_TOKEN],
    maxInstances: 1
  },
  async () => {
    const now = admin.firestore.Timestamp.now();

    const snapshot = await db
      .collection("liveSessions")
      .where("status", "==", "active")
      .where("alertsEnabled", "==", true)
      .where("nextReminderAt", "<=", now)
      .get();

    console.log("Scheduled reminder scan", {
      dueSessions: snapshot.size
    });

    for (const document of snapshot.docs) {
      const session = document.data();

      try {
        if (!session.telegramChatId) {
          console.warn("Skipping session without chat ID", {
            sessionId: document.id
          });
          continue;
        }

        const first = session.firstCheckDone !== true;

        const text = first
          ? "공복 시작 후 첫 체크인 시간입니다.\n현재 상태에 가까운 점수를 선택해 주세요."
          : "공복 진행 상황을 확인해 주세요.\n현재 상태에 가까운 점수를 선택해 주세요.";

        await sendTelegramMessage(
          session.telegramChatId,
          text
        );

        const nextReminderAt =
          session.reminderMinutes &&
          Number(session.reminderMinutes) > 0
            ? new Date(
                Date.now() +
                Number(session.reminderMinutes) * 60000
              )
            : null;

        await document.ref.update({
          firstCheckDone: true,
          nextReminderAt,
          firstReminderSentAt: first
            ? admin.firestore.FieldValue.serverTimestamp()
            : session.firstReminderSentAt ||
              admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log("Scheduled reminder sent", {
          sessionId: document.id,
          first,
          nextReminderAt
        });
      } catch (error) {
        console.error("Scheduled reminder error", {
          sessionId: document.id,
          error: error.message
        });
      }
    }
  }
);

