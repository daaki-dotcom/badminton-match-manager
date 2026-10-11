import { ref, get, set, update, remove } from 'firebase/database'
import { db, ROOT } from './firebase'
import { ChouseisanEntry, GuestUserRecord, Match } from './types'
import { matchHasPlayer, isSampleName } from './matchUtils'

// 削除したゲスト・回答の控え。管理者・オーナーだけが読み書きできる場所（badminton の外）に保存する。
// 次の午前3時（日本時間）の自動掃除までは「元に戻す」ができる
// （掃除で削除済みIDのログイン用アカウントが消えるため、それ以降は戻せない）
export const BACKUP_ROOT = 'guestDeleteBackups'
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export function nextCleanupAt(now = Date.now()): number {
  const jst = now + JST_OFFSET_MS
  let boundary = Math.floor(jst / DAY_MS) * DAY_MS + 3 * 60 * 60 * 1000
  if (boundary <= jst) boundary += DAY_MS
  return boundary - JST_OFFSET_MS
}

export interface GuestBackup {
  key: string
  at: number
  expiresAt: number
  guestId?: string                             // ログインIDも消した場合のみ
  name: string
  guest?: GuestUserRecord
  entries?: { id: string; value: unknown }[]   // chouseisanEntries/{id} の中身
  byName?: { path: string; value: unknown }[]  // 'attendance/名前' などのパス → 消した値
  matches?: Match[]                            // 消した試合
}

// Firebase の指定ノードを丸ごと読む（存在しなければ空オブジェクト）
export async function readNode(path: string): Promise<Record<string, unknown>> {
  const snap = await get(ref(db, `${ROOT}/${path}`))
  return snap.exists() ? (snap.val() as Record<string, unknown>) : {}
}

export interface EntryDeletePlan {
  name: string
  entryIds: string[]
  guestId?: string
  guest?: GuestUserRecord
  touchName: boolean
  byName: { node: string; label: string; value: unknown }[]
  hitMatches: Match[]
  allMatches: Match[]
  summary: string[]
}

const norm = (s: string) => s.replace(/[ 　]/g, '')

// 回答一覧の1件を消すとき、その人に紐づくデータをすべて洗い出す（まだ消さない）
export async function planEntryDeletion(entry: ChouseisanEntry): Promise<EntryDeletePlan> {
  const [ch, users, guests, attendance, levels, comments, party, payClub, payParty, matchesNode] = await Promise.all([
    readNode('chouseisanEntries'), readNode('users'), readNode('guestUsers'), readNode('attendance'),
    readNode('memberLevels'), readNode('attendanceComments'), readNode('party'),
    readNode('paymentClub'), readNode('paymentParty'), readNode('matches'),
  ])
  const name = entry.name
  const guestId = entry.linkedGuestId
  const entryIds = Object.entries(ch)
    .filter(([id, v]) => id === entry.id || (!!guestId && (v as ChouseisanEntry).linkedGuestId === guestId))
    .map(([id]) => id)
  const guest = guestId ? (guests[guestId] as GuestUserRecord | undefined) : undefined

  // 同じ名前の別の登録（正規部員・別のゲスト・別の回答）がある場合、名前単位のデータは巻き込まない
  const sameNameElsewhere =
    Object.values(users).some(u => norm((u as { name?: string }).name ?? '') === norm(name)) ||
    Object.entries(guests).some(([id, g]) => id !== guestId && norm((g as GuestUserRecord).name ?? '') === norm(name)) ||
    Object.entries(ch).some(([id, v]) => !entryIds.includes(id) && norm((v as ChouseisanEntry).name ?? '') === norm(name))
  const touchName = name !== '' && !sameNameElsewhere && !isSampleName(name)

  const byName: EntryDeletePlan['byName'] = []
  const add = (node: string, label: string, values: Record<string, unknown>) => {
    if (values[name] !== undefined) byName.push({ node, label, value: values[name] })
  }
  if (touchName) {
    add('attendance', '出欠', attendance)
    add('memberLevels', 'レベル', levels)
    add('attendanceComments', 'コメント', comments)
    add('party', '懇親会の回答', party)
    add('paymentClub', '部活参加費の支払い', payClub)
    add('paymentParty', '懇親会費の支払い', payParty)
  }
  const allMatches = Object.values(matchesNode) as Match[]
  const hitMatches = touchName ? allMatches.filter(m => matchHasPlayer(m, name)) : []

  const summary = [`回答一覧の回答 ${entryIds.length}件`]
  if (guest) summary.push(`ログインID（${guestId}）`)
  byName.forEach(b => summary.push(b.label))
  if (hitMatches.length > 0) summary.push(`試合 ${hitMatches.length}件`)

  return { name, entryIds, guestId: guest ? guestId : undefined, guest, touchName, byName, hitMatches, allMatches, summary }
}

// 控えを保存してから、紐づくデータを1回の更新ですべて消す
export async function executeEntryDeletion(plan: EntryDeletePlan): Promise<void> {
  const { name, entryIds, guestId, guest, byName, hitMatches, allMatches } = plan
  const at = Date.now()
  const backupKey = `${at}_${guestId ?? entryIds[0]}`
  const updates: Record<string, unknown> = {}

  const chNode = await readNode('chouseisanEntries')
  entryIds.forEach(id => { updates[`chouseisanEntries/${id}`] = null })
  if (guestId) updates[`guestUsers/${guestId}`] = null
  byName.forEach(b => { updates[`${b.node}/${name}`] = null })
  if (hitMatches.length > 0) {
    const rest = allMatches.filter(m => !hitMatches.includes(m))
    updates['matches'] = rest.length > 0 ? Object.fromEntries(rest.map((m, i) => [String(i), m])) : null
  }

  const backup: Omit<GuestBackup, 'key'> = {
    at, expiresAt: nextCleanupAt(at), name,
    ...(guestId && guest && { guestId, guest }),
    entries: entryIds.map(id => ({ id, value: chNode[id] })),
    ...(byName.length > 0 && { byName: byName.map(b => ({ path: `${b.node}/${name}`, value: b.value })) }),
    ...(hitMatches.length > 0 && { matches: hitMatches }),
  }
  await set(ref(db, `${BACKUP_ROOT}/${backupKey}`), backup)
  try {
    await update(ref(db, ROOT), updates)
  } catch (e) {
    await remove(ref(db, `${BACKUP_ROOT}/${backupKey}`))
    throw e
  }
}
