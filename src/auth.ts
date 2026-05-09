import { ref, get } from 'firebase/database'
import { db, ROOT } from './firebase'
import { AuthUser, SessionData, UserRecord, UserRole } from './types'

const SESSION_KEY = 'badminton_session'
const SESSION_TTL = 24 * 60 * 60 * 1000  // 1日（ms）

// Web Crypto API で SHA-256 ハッシュ値を生成する
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Firebase から users ノードを取得してパスワードを照合し、AuthUser を返す
// 失敗時は null を返す
export async function loginWithId(userId: string, password: string): Promise<AuthUser | null> {
  const snap = await get(ref(db, `${ROOT}/users/${userId}`))
  if (!snap.exists()) return null

  const record = snap.val() as UserRecord
  const inputHash = await hashPassword(password)
  if (inputHash !== record.passwordHash) return null

  const user: AuthUser = {
    userId,
    role: record.role,
    name: record.name ?? userId,  // name未設定の場合はIDを表示名として使う
    isFirstLogin: record.isFirstLogin,
  }

  // isFirstLogin でない場合のみセッションを保存する
  // （初回ログイン時はパスワード変更後に保存する）
  if (!record.isFirstLogin) {
    saveSession(userId, record.role, user.name)
  }

  return user
}

// guest として入場する（セッション保存なし・role は guest 固定）
export function loginAsGuest(): AuthUser {
  return { userId: 'guest', role: 'guest', name: 'ゲスト', isFirstLogin: false }
}

// localStorage にセッションを保存する
export function saveSession(userId: string, role: UserRole, name: string): void {
  const session: SessionData = {
    userId,
    role,
    name,
    expiry: Date.now() + SESSION_TTL,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

// localStorage からセッションを読み込む
// 期限切れまたは存在しない場合は null を返す
export function loadSession(): SessionData | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as SessionData
    if (Date.now() > session.expiry) {
      clearSession()
      return null
    }
    return session
  } catch {
    clearSession()
    return null
  }
}

// localStorage のセッションを削除する
export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
