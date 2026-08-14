const { db } = require('./firebase');

async function testFirebaseConnection() {
  const testRef = db
    .collection('connectionTests')
    .doc('telegramBot');

  await testRef.set({
    status: 'connected',
    source: 'telegram-bot',
    testedAt: new Date()
  });

  const snapshot = await testRef.get();

  console.log('Firebase 연결 성공');
  console.log('문서 존재 여부:', snapshot.exists);
  console.log('문서 경로: connectionTests/telegramBot');
}

testFirebaseConnection()
  .catch((error) => {
    console.error('Firebase 연결 실패:', error.message);
    process.exitCode = 1;
  });