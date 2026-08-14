require('dotenv').config();

const {
  initializeApp,
  getApps,
  cert
} = require('firebase-admin/app');

const {
  getFirestore
} = require('firebase-admin/firestore');

const encodedServiceAccount =
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!encodedServiceAccount) {
  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT_BASE64 환경변수가 없습니다.'
  );
}

let serviceAccount;

try {
  const json = Buffer.from(
    encodedServiceAccount,
    'base64'
  ).toString('utf8');

  serviceAccount = JSON.parse(json);
} catch (error) {
  throw new Error(
    `Firebase 서비스 계정 정보를 읽을 수 없습니다: ${error.message}`
  );
}

const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount)
    });

const db = getFirestore(app);

module.exports = {
  db
};