export type AttendanceStatus = 'yes' | 'no' | 'undecided' | ''
export type MemberLevel = 'exp' | 'nov'
export type MatchStatus = 'wait' | 'playing' | 'done'
export type TierFilter = 'all' | 'exp' | 'nov'
export type MatchType = 'singles' | 'doubles'
export type PartyStatus = 'yes' | 'no' | ''

// owner: 最上位権限・試合不参加 / admin: 全操作可 / member: 個人変更・スコア入力可 / guest: 閲覧・懇親会回答のみ
export type UserRole = 'owner' | 'admin' | 'member' | 'guest'

export interface Match {
  p1: string
  p2: string
  s1: string
  s2: string
  status: MatchStatus
  court: number
}

export interface AppState {
  attendance: Record<string, AttendanceStatus>
  memberLevels: Record<string, MemberLevel>  // ゲストのセッション別レベル
  activityDate: string
  courts: number
  matches: Match[]
  party: Record<string, PartyStatus>
  paymentClub:  Record<string, boolean>   // 部活参加費 支払い済みフラグ
  paymentParty: Record<string, boolean>   // 懇親会費 支払い済みフラグ
}

// Firebase の badminton/users/{randomId} に保存するデータ
export interface UserRecord {
  passwordHash: string
  role: 'owner' | 'admin' | 'member'
  isFirstLogin: boolean
  name: string
  level?: MemberLevel      // 正規部員の経験者・未経験者（DB永続管理）
  managementOnly?: boolean // true = 管理専用（出欠・レベル・試合対象外）
}

// ログイン後にアプリ内で保持するセッション情報
export interface AuthUser {
  userId: string      // ランダムID
  role: UserRole
  name: string        // 部員の名前
  isFirstLogin: boolean
}

// localStorage に保存するセッションデータ（正規部員）
export interface SessionData {
  userId: string
  role: UserRole
  name: string
  expiry: number      // Unix タイムスタンプ（ms）
}

// localStorage に保存するゲストセッションデータ
export interface GuestSessionData {
  guestId: string     // 登録時に生成する一意ID（例: g_abc123）
  name: string
  expiry: number      // 活動日の23:59:59（ms）・期限後はIDを解放
}

// Firebase の badminton/guests/{guestId} に保存するデータ
export interface GuestRecord {
  name: string
  expiry: number      // 活動日の23:59:59（ms）
}
