// 既存の users / guestUsers を Firebase Authentication へ移行する一度きりのスクリプト
//
// 実行前提：
//   1. npm install --save-dev firebase-admin が実行済みであること
//   2. サービスアカウントの秘密鍵（JSON）を用意し、環境変数 GOOGLE_APPLICATION_CREDENTIALS に
//      そのファイルパスを設定しておくこと
//      （Firebaseコンソール → プロジェクトの設定 → サービスアカウント → 新しい秘密鍵の生成）
//   3. Firebase Authenticationの「メール/パスワード」ログイン方法が有効化されていること
//
// 設計：Firebase Authenticationの内部ID（uid）はFirebase側の自動採番に任せる
// （クライアント側でのアカウント作成、例：createAuthAccount、はuidを指定できない仕様のため、
//  移行分だけ特別扱い＝uidをアプリのIDに強制する、とすると今後作られるアカウントと
//  仕組みが食い違ってしまう）。かわりに「uid → アプリのID」の対応表を
//  badminton/authUidToId に書き込み、以後のセキュリティルールや管理処理は
//  すべてこの対応表を通じて本人を特定する。
//
// このスクリプトは badminton/users・badminton/guestUsers に存在する各レコードに対して、
// 既存のFirebase Authenticationアカウントがあれば一旦削除し、新しい設計で作り直す。
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

  const results = { created: [], failed: [] }

  for (const id of ids) {
    try {
      // 旧方式（uid = アプリのID）で作られたアカウントが残っていれば削除する
      try {
        await auth.getUser(id)
        await auth.deleteUser(id)
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e
      }
      // メールアドレス重複（別のuidで既に存在する場合）も念のため削除する
      try {
        const existing = await auth.getUserByEmail(emailForId(id))
        await auth.deleteUser(existing.uid)
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e
      }

      // 新しいuidを自動採番させて作成し、対応表を書き込む
      const created = await auth.createUser({
        email: emailForId(id),
        password: INITIAL_PASSWORD,
        emailVerified: true,
      })
      await db.ref(`${ROOT}/authUidToId/${created.uid}`).set(id)
      results.created.push(id)
    } catch (e) {
      results.failed.push({ id, error: e.message })
    }
  }

  console.log(`  作成:${results.created.length}件 / 失敗:${results.failed.length}件`)
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
