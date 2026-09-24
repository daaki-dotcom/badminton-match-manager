// 孤立したFirebase Authenticationアカウント・authUidToId対応表を掃除するスクリプト
//
// 背景：ゲストの登録情報(guestUsers)は活動日翌日に自動削除されるが、対応する
// Firebase Authenticationアカウント自体はクライアント側から削除できない仕様のため、
// 「users/guestUsersのどちらにも存在しないID」として残り続ける（ゴミデータ化する）。
// このスクリプトは authUidToId の対応表を全件チェックし、users・guestUsersの
// どちらにも対応するレコードが無いものを、Firebase Authenticationアカウントごと削除する。
//
// 実行方法：
//   - GitHub Actions（.github/workflows/cleanup-orphaned-auth.yml）から毎日自動実行される
//   - ローカルで手動実行する場合：
//       GOOGLE_APPLICATION_CREDENTIALS=./サービスアカウント鍵.json node scripts/cleanup-orphaned-auth.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const DATABASE_URL = 'https://badminton-match-manager-e5ad8-default-rtdb.asia-southeast1.firebasedatabase.app'
const ROOT = 'badminton'

// GitHub Actions環境ではJSON文字列そのものを環境変数で渡す。
// ローカル実行ではGOOGLE_APPLICATION_CREDENTIALSにファイルパスを渡す想定（migrate-existing-accounts.mjsと同じ流儀）。
const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
  : cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)

const app = initializeApp({ credential, databaseURL: DATABASE_URL })
const auth = getAuth(app)
const db = getDatabase(app)

const [mapSnap, usersSnap, guestsSnap] = await Promise.all([
  db.ref(`${ROOT}/authUidToId`).once('value'),
  db.ref(`${ROOT}/users`).once('value'),
  db.ref(`${ROOT}/guestUsers`).once('value'),
])

const map = mapSnap.val() || {}
const validIds = new Set([
  ...Object.keys(usersSnap.val() || {}),
  ...Object.keys(guestsSnap.val() || {}),
])

let deletedCount = 0
for (const [uid, appId] of Object.entries(map)) {
  if (validIds.has(appId)) continue

  try {
    await auth.deleteUser(uid)
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.log(`  警告: uid=${uid}（${appId}）のFirebase Authenticationアカウント削除に失敗: ${e.message}`)
    }
  }
  await db.ref(`${ROOT}/authUidToId/${uid}`).remove()
  deletedCount++
  console.log(`  削除: ${appId}（uid=${uid}）`)
}

console.log(`完了。孤立エントリ ${deletedCount} 件を削除しました（対応表エントリ総数: ${Object.keys(map).length}件）`)
process.exit(0)
