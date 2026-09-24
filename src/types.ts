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
  hidden?: boolean         // true = 管理画面の一覧・人数カウントに表示しない（動作確認用アカウント等）
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

// Firebase の badminton/guestUsers/{guestId} に保存するデータ（活動日終了時に削除）
export interface GuestUserRecord {
  passwordHash: string
  name: string
  pending?: boolean  // true = 複数候補日モードで発行された仮ID（活動日確定までログイン不可）
}

// ── 調整機能（出欠回答フォーム） ──────────────────────────────────

export type ChouseisanMode = 'single' | 'multi'

// フォームで回答された1件（正規部員・ゲスト・✕/△の回答者も含めて内部管理する）
export interface ChouseisanEntry {
  id: string                                // 内部識別子（同姓同名の別人がいる場合の区別にも使う）
  name: string                              // 入力された名前（表示用、正規化前）
  memberType: 'member' | 'guest'
  level: MemberLevel
  comment: string
  mode: ChouseisanMode
  answers: Record<string, AttendanceStatus> // 単一日程モードはキー 'single' のみ、複数候補日モードは日付文字列がキー
  linkedUserId?: string                     // 正規部員として照合できた場合の users/{id}
  linkedGuestId?: string                    // このフォーム経由でゲストIDを発行した場合
  createdAt: number
  updatedAt: number
}
