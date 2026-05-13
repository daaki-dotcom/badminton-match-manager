import { ref, get } from 'firebase/database'
import { db, ROOT } from './firebase'
import { AuthUser, SessionData, UserRecord, UserRole, GuestUserRecord } from './types'

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

// users → guestUsers の順で照合し AuthUser を返す
export async function loginWithId(userId: string, password: string): Promise<AuthUser | null> {
  const inputHash = await hashPassword(password)

  // 正規部員チェック
  const memberSnap = await get(ref(db, `${ROOT}/users/${userId}`))
  if (memberSnap.exists()) {
    const record = memberSnap.val() as UserRecord
    if (inputHash !== record.passwordHash) return null
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
    if (inputHash !== record.passwordHash) return null
    const user: AuthUser = {
      userId,
      role: 'guest',
      name: record.name,
      isFirstLogin: false,
    }
    saveSession(userId, 'guest', user.name)
    return user
  }

  return null
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
}
