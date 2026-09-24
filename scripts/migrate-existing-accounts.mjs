// 既存の users / guestUsers を Firebase Authentication へ移行する一度きりのスクリプト
//
// 実行前提：
//   1. npm install --save-dev firebase-admin が実行済みであること
//   2. サービスアカウントの秘密鍵（JSON）を用意し、環境変数 GOOGLE_APPLICATION_CREDENTIALS に
//      そのファイルパスを設定しておくこと
//      （Firebaseコンソール → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵の生成）
//   3. Firebase Authenticationの「メール/パスワード」ログイン方法が有効化されていること
//
// このスクリプトは badminton/users・badminton/guestUsers に存在する各レコードに対して、
// 同じIDをFirebase AuthenticationのUIDとして持つアカウントを作成する（既に存在する場合はスキップ）。
// パスワードは元の値を復元できないため、全員 INITIAL_PASSWORD に統一し、isFirstLogin を
// true に戻すことで「次回ログイン時にパスワード変更を求める」既存の仕組みに乗せる。
//
// 実行方法： node scripts/migrate-existing-accounts.mjs

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'

const DATABASE_URL = 'https://badminton-match-manager-e5ad8-default-rtdb.asia-southeast1.firebasedatabase.app'
const ROOT = 'badminton'
const INITIAL_PASSWORD = 'nicesoul'
const emailForId = id => `${id}@badminton.local`

const app = initializeApp({
  credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  databaseURL: DATABASE_URL,
})
const auth = getAuth(app)
const db = getDatabase(app)

async function migrateNode(path, label) {
  const snap = await db.ref(`${ROOT}/${path}`).once('value')
  const data = snap.val() || {}
  const ids = Object.keys(data)
  console.log(`\n=== ${label}（${ids.length}件） ===`)

  const results = { created: [], skipped: [], failed: [] }

  for (const id of ids) {
    try {
      await auth.getUser(id)
      results.skipped.push(id)
      continue
    } catch (e) {
      if (e.code !== 'auth/user-not-found') { results.failed.push({ id, error: e.message }); continue }
    }

    try {
      await auth.createUser({
        uid: id,
        email: emailForId(id),
        password: INITIAL_PASSWORD,
        emailVerified: true,
      })
      results.created.push(id)
    } catch (e) {
      results.failed.push({ id, error: e.message })
    }
  }

  console.log(`  作成:${results.created.length}件 / 既存でスキップ:${results.skipped.length}件 / 失敗:${results.failed.length}件`)
  if (results.failed.length > 0) console.log('  失敗一覧:', results.failed)
  return results
}

async function markMembersFirstLoginTrue(createdIds) {
  if (createdIds.length === 0) return
  const updates = {}
  for (const id of createdIds) {
    updates[`${ROOT}/users/${id}/isFirstLogin`] = true
  }
  await db.ref().update(updates)
  console.log(`  isFirstLogin を true に設定しました（対象 ${createdIds.length}件）`)
}

const memberResult = await migrateNode('users', '正規部員（users）')
await markMembersFirstLoginTrue(memberResult.created)

await migrateNode('guestUsers', 'ゲスト（guestUsers）')

console.log('\n移行完了。対象者には「初期パスワード: nicesoul」で再ログインし、パスワード変更するよう案内してください。')
process.exit(0)
