import { ref, get } from 'firebase/database'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword as fbUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut as fbSignOut,
} from 'firebase/auth'
import { db, ROOT, fbAuth, emailForId, firebaseConfig } from './firebase'
import { AuthUser, SessionData, UserRecord, UserRole, GuestUserRecord } from './types'

const SESSION_KEY = 'badminton_session'
const SESSION_TTL = 24 * 60 * 60 * 1000  // 1日（ms）

// Web Crypto API で SHA-256 ハッシュ値を生成する
// 注：本人確認の判定には使わなくなったが、users/guestUsers レコードの形
// （既存のFirebaseルールが passwordHash フィールドの存在を必須にしている）を崩さないよう、
// 引き続き書き込みには使う（値そのものはもう照合に使われない）
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Firebase Authentication に、このアプリのID用の新規アカウントを作る
// （すでに同じIDのアカウントがある場合はエラーを投げる。呼び出し元で捕捉すること）
//
// 注意：Firebaseの仕様上、アカウント作成はその場で「作成したアカウントへのログイン」を
// 兼ねてしまう。管理者が他人のアカウントを作る場合に管理者自身のログインが切れてしまわないよう、
// 使い捨ての別インスタンス（一時アプリ）上で作成し、現在のログイン状態には一切影響させない
export async function createAuthAccount(id: string, password: string): Promise<void> {
  const tempApp = initializeApp(firebaseConfig, `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    const tempAuth = getAuth(tempApp)
    await createUserWithEmailAndPassword(tempAuth, emailForId(id), password)
  } finally {
    await deleteApp(tempApp)
  }
}

// users → guestUsers の順で照合し AuthUser を返す
// パスワードの正しさは Firebase Authentication が判定する（本人確認はFirebase側で完結）
export async function loginWithId(userId: string, password: string): Promise<AuthUser | null> {
  try {
    await signInWithEmailAndPassword(fbAuth, emailForId(userId), password)
  } catch {
    // ID・パスワードの組み合わせが正しくない（存在しないIDも含む）
    return null
  }

  // 正規部員チェック
  const memberSnap = await get(ref(db, `${ROOT}/users/${userId}`))
  if (memberSnap.exists()) {
    const record = memberSnap.val() as UserRecord
    const user: AuthUser = {
      userId,
      role: record.role,
      name: record.name ?? userId,
      isFirstLogin: record.isFirstLogin,
    }
    if (!record.isFirstLogin) saveSession(userId, record.role, user.name)
    return user
  }

  // ゲストチェック
  const guestSnap = await get(ref(db, `${ROOT}/guestUsers/${userId}`))
  if (guestSnap.exists()) {
    const record = guestSnap.val() as GuestUserRecord
    if (record.pending) {
      await fbSignOut(fbAuth)
      throw new Error('PENDING_ID')
    }
    const user: AuthUser = {
      userId,
      role: 'guest',
      name: record.name,
      isFirstLogin: false,
    }
    saveSession(userId, 'guest', user.name)
    return user
  }

  // Firebase Authenticationのアカウントはあるが、users/guestUsers側にレコードが無い
  // （通常は起こらない想定だが、念のためサインアウトしてnullを返す）
  await fbSignOut(fbAuth)
  return null
}

// 本人が自分のパスワードを変更する（設定画面：現在のパスワード入力あり）
export async function changeOwnPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = fbAuth.currentUser
  if (!user) throw new Error('NOT_SIGNED_IN')
  // Firebaseの仕様上、パスワード変更には直近の再認証が必要
  const credential = EmailAuthProvider.credential(emailForId(userId), currentPassword)
  await reauthenticateWithCredential(user, credential)
  await fbUpdatePassword(user, newPassword)
}

// 初回ログイン直後の強制パスワード変更（サインイン直後なので再認証は不要）
export async function setOwnPassword(newPassword: string): Promise<void> {
  const user = fbAuth.currentUser
  if (!user) throw new Error('NOT_SIGNED_IN')
  await fbUpdatePassword(user, newPassword)
}

// ゲスト用のランダムID（例: g_abc123）を生成する
export function generateGuestId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const rand = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `g_${rand}`
}

// guest として入場する（名前登録前の閲覧専用モード）
export function loginAsGuest(): AuthUser {
  return { userId: 'guest', role: 'guest', name: '', isFirstLogin: false }
}

// ── セッション管理 ──────────────────────────────────

export function saveSession(userId: string, role: UserRole, name: string): void {
  const session: SessionData = {
    userId, role, name,
    expiry: Date.now() + SESSION_TTL,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadSession(): SessionData | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as SessionData
    if (Date.now() > session.expiry) { clearSession(); return null }
    return session
  } catch {
    clearSession(); return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
  fbSignOut(fbAuth)
}
