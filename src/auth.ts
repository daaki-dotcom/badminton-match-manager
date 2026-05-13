import { ref, get } from 'firebase/database'
import { db, ROOT } from './firebase'
import { AuthUser, SessionData, GuestSessionData, UserRecord, UserRole } from './types'

const SESSION_KEY       = 'badminton_session'
const GUEST_SESSION_KEY = 'badminton_guest_session'
const SESSION_TTL       = 24 * 60 * 60 * 1000  // 1日（ms）

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
export async function loginWithId(userId: string, password: string): Promise<AuthUser | null> {
  const snap = await get(ref(db, `${ROOT}/users/${userId}`))
  if (!snap.exists()) return null

  const record = snap.val() as UserRecord
  const inputHash = await hashPassword(password)
  if (inputHash !== record.passwordHash) return null

  const user: AuthUser = {
    userId,
    role: record.role,
    name: record.name ?? userId,
    isFirstLogin: record.isFirstLogin,
  }

  if (!record.isFirstLogin) {
    saveSession(userId, record.role, user.name)
  }

  return user
}

// guest として入場する（名前は後でホーム画面で登録するため空文字）
export function loginAsGuest(): AuthUser {
  return { userId: 'guest', role: 'guest', name: '', isFirstLogin: false }
}

// ── 正規部員セッション ──────────────────────────────

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
}

// ── ゲストセッション ────────────────────────────────

// 活動日の23:59:59 をセッション有効期限とする
// 活動日未設定の場合は当日の23:59:59
function getEndOfDay(dateStr: string): number {
  const base = dateStr || new Date().toISOString().split('T')[0]
  const d = new Date(base)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

// ゲストセッションを localStorage に保存する
export function saveGuestSession(name: string, activityDate: string): void {
  const session: GuestSessionData = {
    name,
    expiry: getEndOfDay(activityDate),
  }
  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session))
}

// localStorage からゲストセッションを読み込む
export function loadGuestSession(): GuestSessionData | null {
  const raw = localStorage.getItem(GUEST_SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as GuestSessionData
    if (Date.now() > session.expiry) { clearGuestSession(); return null }
    return session
  } catch {
    clearGuestSession(); return null
  }
}

// ゲストセッションを削除する
export function clearGuestSession(): void {
  localStorage.removeItem(GUEST_SESSION_KEY)
}
