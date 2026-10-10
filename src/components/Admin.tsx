import { useState, useEffect } from 'react'
import { ref, get, set, remove, update, onValue } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { hashPassword, createAuthAccount } from '../auth'
import { UserRecord, MemberLevel, GuestUserRecord, ChouseisanEntry, Match } from '../types'
import { AdminSchedule } from './AdminSchedule'
import { BACKUP_ROOT, GuestBackup, nextCleanupAt, readNode } from '../guestBackup'
import { matchHasPlayer, isValidPlayerName, INVALID_NAME_MESSAGE } from '../matchUtils'

const INITIAL_PASSWORD = 'nicesoul'
const MAX_ADMIN = 4

function generateRandomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

interface UserEntry {
  id: string
  record: UserRecord
}

interface GuestEntry {
  id: string
  record: GuestUserRecord
}

interface GuestDeleteRow {
  key: string
  label: string
  value: string
  locked?: boolean
  nameKeyed?: boolean
}

interface GuestDeletePlan {
  entry: GuestEntry
  name: string
  linkedIds: string[]
  touchName: boolean
  hitMatches: Match[]
  allMatches: Match[]
  rows: GuestDeleteRow[]
  hasAttendance: boolean
  raw: {
    chNode: Record<string, unknown>
    attendance: Record<string, unknown>
    levels: Record<string, unknown>
    comments: Record<string, unknown>
    party: Record<string, unknown>
    payClub: Record<string, unknown>
    payParty: Record<string, unknown>
  }
}

interface Props {
  currentRole: 'owner' | 'admin'
}

export function Admin({ currentRole }: Props) {
  const [users, setUsers]             = useState<UserEntry[]>([])
  const [newId, setNewId]             = useState('')
  const [newName, setNewName]         = useState('')
  const [nameError, setNameError]     = useState('')
  const [copied, setCopied]           = useState(false)
  const [loading, setLoading]         = useState(true)
  const [roleError, setRoleError]     = useState('')

  // 名前インライン編集
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // 活動日
  const [activityDate, setActivityDate]   = useState('')
  const [dateInput, setDateInput]         = useState('')
  const [dateSaved, setDateSaved]         = useState(false)

  // 正規部員 一括登録
  type CsvRow    = { name: string; level: MemberLevel }
  type IssuedRow = { name: string; id: string; level: MemberLevel }
  const [memberPreview,  setMemberPreview]  = useState<CsvRow[]>([])
  const [memberIssued,   setMemberIssued]   = useState<IssuedRow[]>([])
  const [memberCsvError, setMemberCsvError] = useState('')
  const [memberBulkLoading, setMemberBulkLoading] = useState(false)
  const [copiedMemberId,  setCopiedMemberId]  = useState<string | null>(null)
  const [copiedAllMember, setCopiedAllMember] = useState(false)

  // ゲスト一覧
  const [guests, setGuests]             = useState<GuestEntry[]>([])
  const [guestsLoading, setGuestsLoading] = useState(true)
  const [copiedGuestListId, setCopiedGuestListId] = useState<string | null>(null)
  const [deletePlan, setDeletePlan]     = useState<GuestDeletePlan | null>(null)
  const [deleteChecks, setDeleteChecks] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting]         = useState(false)
  const [backups, setBackups]           = useState<GuestBackup[]>([])
  const [restoringKey, setRestoringKey]   = useState<string | null>(null)
  const [restoreMsg, setRestoreMsg]     = useState('')


  // 削除したゲストの控え（期限が過ぎたものは表示しない）
  useEffect(() => {
    return onValue(ref(db, BACKUP_ROOT), snap => {
      const data = (snap.val() ?? {}) as Record<string, Omit<GuestBackup, 'key'>>
      setBackups(Object.entries(data).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.at - a.at))
    }, () => setBackups([]))
  }, [])
  const liveBackups = backups.filter(b => b.expiresAt > Date.now())

  const fetchUsers = async () => {
    setLoading(true)
    const snap = await get(ref(db, `${ROOT}/users`))
    if (snap.exists()) {
      const data = snap.val() as Record<string, UserRecord>
      // hidden: true の動作確認用アカウント等は、一覧・人数カウントから除外する
      setUsers(Object.entries(data).filter(([, record]) => !record.hidden).map(([id, record]) => ({ id, record })))
    } else {
      setUsers([])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
    // 活動日をリアルタイムで監視する
    const unsub = onValue(ref(db, `${ROOT}/activityDate`), snap => {
      const val = snap.val() as string ?? ''
      setActivityDate(val)
      setDateInput(val)
    })
    // ゲスト一覧をリアルタイムで監視する
    const unsubGuests = onValue(ref(db, `${ROOT}/guestUsers`), snap => {
      if (snap.exists()) {
        const data = snap.val() as Record<string, GuestUserRecord>
        setGuests(Object.entries(data).map(([id, record]) => ({ id, record })))
      } else {
        setGuests([])
      }
      setGuestsLoading(false)
    })
    return () => { unsub(); unsubGuests() }
  }, [])

  const handleSaveDate = async () => {
    await set(ref(db, `${ROOT}/activityDate`), dateInput)
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 2000)
  }

  const handleIssueId = async () => {
    const trimmedName = newName.trim()
    if (!trimmedName) { setNameError('名前を入力してください'); return }
    if (!isValidPlayerName(trimmedName)) { setNameError(INVALID_NAME_MESSAGE); return }
    setNameError('')
    const id = generateRandomId()
    try {
      await createAuthAccount(id, INITIAL_PASSWORD)
      const hash = await hashPassword(INITIAL_PASSWORD)
      await set(ref(db, `${ROOT}/users/${id}`), {
        passwordHash: hash,
        role: 'member',
        isFirstLogin: true,
        name: trimmedName,
      } satisfies UserRecord)
      setNewId(id)
      setNewName('')
      await fetchUsers()
    } catch {
      setNameError('ID発行に失敗しました。時間をおいて再度お試しください。')
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`ID: ${newId} / 初期PW: ${INITIAL_PASSWORD}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleRole = async (entry: UserEntry) => {
    // owner の role は変更不可（専用ボタンで操作）
    if (entry.record.role === 'owner') return
    const nextRole = entry.record.role === 'admin' ? 'member' : 'admin'
    if (nextRole === 'admin') {
      const adminCount = users.filter(u => u.record.role === 'admin').length
      if (adminCount >= MAX_ADMIN) {
        setRoleError(`adminは${MAX_ADMIN}人までです（現在 ${adminCount}人）`)
        return
      }
    }
    setRoleError('')
    await update(ref(db, `${ROOT}/users/${entry.id}`), { role: nextRole })
    await fetchUsers()
  }

  // オーナーを指定した相手に譲渡する（自分は admin になる）
  const handleTransferOwner = async (entry: UserEntry) => {
    const currentOwner = users.find(u => u.record.role === 'owner')
    if (!currentOwner) return
    if (!confirm(`${entry.record.name} にオーナーを譲渡します。\nあなたは admin になります。よろしいですか？`)) return
    await update(ref(db, `${ROOT}/users/${currentOwner.id}`), { role: 'admin' })
    await update(ref(db, `${ROOT}/users/${entry.id}`), { role: 'owner' })
    setRoleError('')
    await fetchUsers()
  }

  const handleStartEditName = (entry: UserEntry) => {
    setEditingId(entry.id)
    setEditingName(entry.record.name ?? '')
  }

  const handleSaveName = async (entry: UserEntry) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    if (!isValidPlayerName(trimmed)) { alert(INVALID_NAME_MESSAGE); return }
    await update(ref(db, `${ROOT}/users/${entry.id}`), { name: trimmed })
    setEditingId(null)
    await fetchUsers()
  }

  const handleToggleLevel = async (entry: UserEntry) => {
    const nextLevel = entry.record.level === 'exp' ? 'nov' : 'exp'
    await update(ref(db, `${ROOT}/users/${entry.id}`), { level: nextLevel })
    await fetchUsers()
  }

  const handleToggleManagementOnly = async (entry: UserEntry) => {
    const next = !entry.record.managementOnly
    const msg = next
      ? `${entry.record.name} を管理専用にしますか？\n出欠・試合・レベル管理の対象外になります。`
      : `${entry.record.name} の管理専用を解除しますか？\n通常の参加者として扱われます。`
    if (!confirm(msg)) return
    await update(ref(db, `${ROOT}/users/${entry.id}`), { managementOnly: next })
    await fetchUsers()
  }

  // Firebase Authenticationの仕様上、管理者が他人の既存パスワードを直接書き換えることはできないため、
  // 「今のIDを無効化し、同じ権限・名前で新しいIDを発行する」ことでパスワード初期化の代わりとする
  const handleResetPassword = async (entry: UserEntry) => {
    if (!confirm(
      `${entry.record.name ?? entry.id} のパスワードを初期化しますか？\n\n` +
      `仕様上、今のID（${entry.id}）はそのまま初期化できないため、\n` +
      `このIDを無効化し、同じ名前・権限で新しいIDを発行します。\n` +
      `新しいIDとパスワードを本人にお伝えください。`
    )) return
    const newIdVal = generateRandomId()
    try {
      await createAuthAccount(newIdVal, INITIAL_PASSWORD)
      const hash = await hashPassword(INITIAL_PASSWORD)
      const newRecord: UserRecord = {
        passwordHash: hash,
        role: entry.record.role,
        isFirstLogin: true,
        name: entry.record.name,
        ...(entry.record.level !== undefined ? { level: entry.record.level } : {}),
        ...(entry.record.managementOnly !== undefined ? { managementOnly: entry.record.managementOnly } : {}),
      }
      await set(ref(db, `${ROOT}/users/${newIdVal}`), newRecord)
      await remove(ref(db, `${ROOT}/users/${entry.id}`))
      setNewId(newIdVal)
      await fetchUsers()
    } catch {
      setRoleError('パスワード初期化（IDの再発行）に失敗しました。時間をおいて再度お試しください。')
    }
  }

  // CSVテキストをパースして名前・レベルの配列を返す
  const parseCSV = (text: string): { rows: CsvRow[]; error: string } => {
    // BOM除去 + 改行正規化
    const lines = text.replace(/^﻿/, '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
    const rows: CsvRow[] = []
    for (const line of lines) {
      const [name, levelStr] = line.split(',').map(s => s.trim())
      if (!name || name === '名前') continue
      if (!isValidPlayerName(name)) return { rows: [], error: `「${name}」: ${INVALID_NAME_MESSAGE}` }
      const level: MemberLevel = levelStr === '経験者' ? 'exp' : 'nov'
      rows.push({ name, level })
    }
    if (rows.length === 0) return { rows: [], error: '有効なデータが見つかりませんでした' }
    return { rows, error: '' }
  }

  // UTF-8 / Shift-JIS 両対応でファイルを読み込む
  const readCSVFile = (file: File, onParsed: (rows: CsvRow[], error: string) => void) => {
    const reader = new FileReader()
    reader.onload = ev => {
      const { rows, error } = parseCSV(ev.target?.result as string)
      // 文字化け検出：置換文字(U+FFFD)が含まれていたらShift-JISで再読込
      if (rows.some(r => r.name.includes('�'))) {
        const r2 = new FileReader()
        r2.onload = ev2 => {
          const { rows: r, error: e } = parseCSV(ev2.target?.result as string)
          onParsed(r, e)
        }
        r2.readAsText(file, 'Shift-JIS')
        return
      }
      onParsed(rows, error)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleMemberCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    readCSVFile(file, (rows, error) => {
      setMemberPreview(rows)
      setMemberCsvError(error)
      setMemberIssued([])
    })
    e.target.value = ''
  }


  const handleBulkIssueMember = async () => {
    setMemberBulkLoading(true)
    try {
      const hash = await hashPassword(INITIAL_PASSWORD)
      const issued: IssuedRow[] = []
      for (const row of memberPreview) {
        const id = generateRandomId()
        await createAuthAccount(id, INITIAL_PASSWORD)
        await set(ref(db, `${ROOT}/users/${id}`), {
          passwordHash: hash,
          role: 'member',
          isFirstLogin: true,
          name: row.name,
          level: row.level,
        } satisfies UserRecord)
        issued.push({ name: row.name, id, level: row.level })
      }
      setMemberIssued(issued)
      setMemberPreview([])
      await fetchUsers()
    } finally {
      setMemberBulkLoading(false)
    }
  }



  const copyRow = (row: IssuedRow, _type?: 'member' | 'guest') => {
    navigator.clipboard.writeText(`${row.name}  ID: ${row.id}  PW: ${INITIAL_PASSWORD}`)
    setCopiedMemberId(row.id)
    setTimeout(() => setCopiedMemberId(null), 2000)
  }

  const copyAll = (issued: IssuedRow[], _type?: 'member' | 'guest') => {
    const text = issued.map(r => `${r.name}  ID: ${r.id}  PW: ${INITIAL_PASSWORD}`).join('\n')
    navigator.clipboard.writeText(text)
    setCopiedAllMember(true)
    setTimeout(() => setCopiedAllMember(false), 2000)
  }


  const handleDelete = async (entry: UserEntry) => {
    if (!confirm(`${entry.record.name ?? entry.id} を削除しますか？`)) return
    await remove(ref(db, `${ROOT}/users/${entry.id}`))
    await fetchUsers()
  }

  // ゲスト削除：確認ウィンドウで、消す項目を管理者がチェックで選ぶ（初期値はすべてON）
  const openDeleteGuest = async (entry: GuestEntry) => {
    const name = entry.record.name ?? ''
    const norm = (s: string) => s.replace(/[ 　]/g, '')

    const [chNode, usersNode, guestsNode, attendance, levels, comments, party, payClub, payParty, matchesNode] = await Promise.all([
      readNode('chouseisanEntries'), readNode('users'), readNode('guestUsers'), readNode('attendance'),
      readNode('memberLevels'), readNode('attendanceComments'), readNode('party'),
      readNode('paymentClub'), readNode('paymentParty'), readNode('matches'),
    ])

    const linkedIds = Object.entries(chNode)
      .filter(([, v]) => (v as ChouseisanEntry).linkedGuestId === entry.id)
      .map(([id]) => id)

    // 同じ名前の別の登録（正規部員・別のゲスト）がある場合、名前単位のデータは巻き込まないよう選べなくする
    const sameNameElsewhere =
      Object.values(usersNode).some(u => norm((u as UserRecord).name ?? '') === norm(name)) ||
      Object.entries(guestsNode).some(([id, g]) => id !== entry.id && norm((g as GuestUserRecord).name ?? '') === norm(name))
    const touchName = name !== '' && !sameNameElsewhere

    const attLabel: Record<string, string> = { yes: '参加', no: '不参加', undecided: '未定' }
    const lvLabel: Record<string, string> = { exp: '経験者', nov: '未経験者' }
    const partyLabel: Record<string, string> = { yes: '参加', no: '不参加' }
    const payLabel = (v: unknown) => (v === undefined ? 'なし' : v ? '済' : '未')

    const allMatches = Object.values(matchesNode) as Match[]
    const hitMatches = touchName
      ? allMatches.filter(m => matchHasPlayer(m, name))
      : []
    const scored = hitMatches.filter(m => m.s1 !== '' || m.s2 !== '').length
    const comment = comments[name] ? `「${String(comments[name])}」` : 'なし'

    const rows: GuestDeleteRow[] = [
      { key: 'login', label: 'ログインID（ゲスト一覧）', value: entry.id, locked: true },
      { key: 'answers', label: '回答一覧の回答', value: `${linkedIds.length}件` },
      { key: 'attendance', label: '出欠', value: attLabel[attendance[name] as string] ?? 'なし', nameKeyed: true },
      { key: 'level', label: 'レベル', value: lvLabel[levels[name] as string] ?? 'なし', nameKeyed: true },
      { key: 'comment', label: 'コメント', value: comment, nameKeyed: true },
      { key: 'party', label: '懇親会の回答', value: partyLabel[party[name] as string] ?? 'なし', nameKeyed: true },
      { key: 'payment', label: '支払い', value: `部活参加費 ${payLabel(payClub[name])} ／ 懇親会費 ${payLabel(payParty[name])}`, nameKeyed: true },
      { key: 'matches', label: '試合', value: `${hitMatches.length}件（スコア入力済 ${scored}件）`, nameKeyed: true },
    ]
    const checks: Record<string, boolean> = {}
    rows.forEach(r => { checks[r.key] = r.nameKeyed ? touchName : true })

    setDeleteChecks(checks)
    setDeletePlan({ entry, name, linkedIds, touchName, hitMatches, allMatches, rows, hasAttendance: attendance[name] !== undefined,
      raw: { chNode, attendance, levels, comments, party, payClub, payParty } })
  }

  const executeDeleteGuest = async () => {
    if (!deletePlan) return
    const { entry, name, linkedIds, touchName, hitMatches, allMatches, raw } = deletePlan
    const c = deleteChecks
    setDeleting(true)
    // 消す前に、消す内容の控えを作る（あとで「元に戻す」に使う）
    const at = Date.now()
    const backupKey = `${at}_${entry.id}`
    const entriesBackup: { id: string; value: unknown }[] = []
    const byNameBackup: { path: string; value: unknown }[] = []
    let matchesBackup: Match[] = []
    try {
      // 複数の場所をまとめて1回の更新で消す（途中で失敗して中途半端に残らないようにする）
      const updates: Record<string, unknown> = { [`guestUsers/${entry.id}`]: null }
      const delByName = (node: string, values: Record<string, unknown>) => {
        updates[`${node}/${name}`] = null
        if (values[name] !== undefined) byNameBackup.push({ path: `${node}/${name}`, value: values[name] })
      }
      if (c.answers) linkedIds.forEach(id => { updates[`chouseisanEntries/${id}`] = null; entriesBackup.push({ id, value: raw.chNode[id] }) })
      if (touchName) {
        if (c.attendance) delByName('attendance', raw.attendance)
        if (c.level)      delByName('memberLevels', raw.levels)
        if (c.comment)    delByName('attendanceComments', raw.comments)
        if (c.party)      delByName('party', raw.party)
        if (c.payment) {
          delByName('paymentClub', raw.payClub)
          delByName('paymentParty', raw.payParty)
        }
        if (c.matches && hitMatches.length > 0) {
          const rest = allMatches.filter(m => !hitMatches.includes(m))
          updates['matches'] = rest.length > 0 ? Object.fromEntries(rest.map((m, i) => [String(i), m])) : null
          matchesBackup = hitMatches
        }
      }
      // 控えを先に保存してから消す。消すのに失敗したら控えを取り消す
      const backup: Omit<GuestBackup, 'key'> = {
        at, expiresAt: nextCleanupAt(at), guestId: entry.id, name, guest: entry.record,
        ...(entriesBackup.length > 0 && { entries: entriesBackup }),
        ...(byNameBackup.length > 0 && { byName: byNameBackup }),
        ...(matchesBackup.length > 0 && { matches: matchesBackup }),
      }
      await set(ref(db, `${BACKUP_ROOT}/${backupKey}`), backup)
      try {
        await update(ref(db, ROOT), updates)
      } catch (e) {
        await remove(ref(db, `${BACKUP_ROOT}/${backupKey}`))
        throw e
      }
      setRestoreMsg('')
      setDeletePlan(null)
    } catch (e) {
      console.error(e)
      alert('削除に失敗しました。ゲストのデータは消えていません。')
    } finally {
      setDeleting(false)
    }
  }

  // 削除したゲストを元に戻す（現在すでにあるデータは上書きしない）
  const restoreGuest = async (b: GuestBackup) => {
    if (!confirm(`「${b.name || b.guestId}」を元に戻しますか？`)) return
    setRestoringKey(b.key)
    try {
      const updates: Record<string, unknown> = {}
      const [guestSnap, matchesNode] = await Promise.all([
        b.guestId ? get(ref(db, `${ROOT}/guestUsers/${b.guestId}`)) : Promise.resolve(null),
        readNode('matches'),
      ])
      if (b.guestId && b.guest && guestSnap && !guestSnap.exists()) updates[`guestUsers/${b.guestId}`] = b.guest
      ;(b.entries ?? []).forEach(({ id, value }) => { updates[`chouseisanEntries/${id}`] = value })
      await Promise.all((b.byName ?? []).map(async ({ path, value }) => {
        const snap = await get(ref(db, `${ROOT}/${path}`))
        if (!snap.exists()) updates[path] = value
      }))
      if (b.matches && b.matches.length > 0) {
        const merged = [...(Object.values(matchesNode) as Match[]), ...b.matches]
        updates['matches'] = Object.fromEntries(merged.map((m, i) => [String(i), m]))
      }
      await update(ref(db, ROOT), updates)
      await remove(ref(db, `${BACKUP_ROOT}/${b.key}`))
      setRestoreMsg(`「${b.name || b.guestId}」を元に戻しました。`)
    } catch (e) {
      console.error(e)
      alert('元に戻せませんでした。')
    } finally {
      setRestoringKey(null)
    }
  }

  const discardBackup = async (b: GuestBackup) => {
    if (!confirm('この控えを破棄します。元に戻せなくなります。よろしいですか？')) return
    await remove(ref(db, `${BACKUP_ROOT}/${b.key}`))
  }

  // 残す項目がある場合の注意書き
  const deleteWarnings: string[] = []
  if (deletePlan) {
    const c = deleteChecks
    const p = deletePlan
    if (p.touchName && !c.attendance && p.hasAttendance) deleteWarnings.push('出欠を残すと、ログインできない参加者として次回以降の組み合わせ対象に残ります')
    if (!c.answers && p.linkedIds.length > 0) deleteWarnings.push('回答一覧の回答を残すと、削除済みIDとの紐づけが切れた状態で残ります')
    if (p.touchName && !c.matches && p.hitMatches.length > 0) deleteWarnings.push('試合を残すと、削除した人の名前が組み合わせ・スコアに残ります')
    if (p.touchName && c.matches && p.hitMatches.length > 0) deleteWarnings.push('該当の試合は組み合わせから取り除かれ、残りの試合が詰めて並び直されます')
  }

  const copyGuestId = (entry: GuestEntry) => {
    navigator.clipboard.writeText(`${entry.record.name}  ID: ${entry.id}`)
    setCopiedGuestListId(entry.id)
    setTimeout(() => setCopiedGuestListId(null), 2000)
  }

  const adminCount = users.filter(u => u.record.role === 'admin').length
  const ownerExists = users.some(u => u.record.role === 'owner')

  return (
    <div className="admin">
      <h2 className="section-title">⚙️ 管理</h2>

      {/* 活動日設定 */}
      <section className="admin-section">
        <h3 className="admin-subtitle">活動日設定</h3>
        <div style={{ fontSize: 13, color: activityDate ? 'var(--accent)' : 'var(--text-muted)', marginBottom: '0.75rem' }}>
          {activityDate
            ? `現在の活動日: ${activityDate}（ゲストデータは7日後に自動削除）`
            : '活動日が設定されていません'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={dateInput} onChange={e => { setDateInput(e.target.value); setDateSaved(false) }}
            style={{ flex: 1, minWidth: 160 }} />
          <button className="btn-primary" onClick={handleSaveDate}>設定する</button>
        </div>
        {dateSaved && <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>✅ 活動日を設定しました</p>}
      </section>

      {/* 日程調整 */}
      <section className="admin-section">
        <AdminSchedule canDelete={currentRole === 'owner'} />
      </section>

      {/* 新規ID発行 */}
      <section className="admin-section">
        <h3 className="admin-subtitle">新規ID発行</h3>
        <div style={{ marginBottom: '0.75rem' }}>
          <input type="text" value={newName}
            onChange={e => { setNewName(e.target.value); setNameError('') }}
            placeholder="部員の名前を入力" style={{ width: '100%' }} />
          {nameError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{nameError}</p>}
        </div>
        <button className="btn-primary" onClick={handleIssueId}>新規IDを発行する</button>

        {newId && (
          <div className="admin-issued">
            <p className="admin-issued-text">
              ID: <strong style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{newId}</strong> を発行しました
            </p>
            <p className="admin-issued-text">初期パスワード: <strong>{INITIAL_PASSWORD}</strong></p>
            <button className="btn-copy" onClick={handleCopy}>
              {copied ? 'コピーしました！' : 'コピーする（ID / 初期PW）'}
            </button>
          </div>
        )}
      </section>

      {/* 正規部員 一括登録 */}
      <section className="admin-section">
        <h3 className="admin-subtitle">正規部員 一括登録（CSV）</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
          フォーマット：<code>名前,レベル</code>（レベルは「経験者」「未経験者」、省略時は未経験者）
        </p>
        <input type="file" accept=".csv" onChange={handleMemberCSV} style={{ fontSize: 13 }} />
        {memberCsvError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{memberCsvError}</p>}

        {memberPreview.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>プレビュー（{memberPreview.length}件）</p>
            <table className="admin-table">
              <thead><tr><th>名前</th><th>レベル</th></tr></thead>
              <tbody>
                {memberPreview.map((r, i) => (
                  <tr key={i}><td>{r.name}</td><td>{r.level === 'exp' ? '経験者' : '未経験者'}</td></tr>
                ))}
              </tbody>
            </table>
            <button className="btn-primary" style={{ marginTop: '0.75rem' }}
              onClick={handleBulkIssueMember} disabled={memberBulkLoading}>
              {memberBulkLoading ? '発行中...' : `${memberPreview.length}人を一括発行する`}
            </button>
          </div>
        )}

        {memberIssued.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <p style={{ fontSize: 12, color: 'var(--accent)' }}>✅ {memberIssued.length}件 発行完了</p>
              <button className="btn-copy" onClick={() => copyAll(memberIssued, 'member')}>
                {copiedAllMember ? 'コピーしました！' : '全部コピー'}
              </button>
            </div>
            <table className="admin-table">
              <thead><tr><th>名前</th><th>レベル</th><th>ID</th><th>PW</th><th></th></tr></thead>
              <tbody>
                {memberIssued.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.level === 'exp' ? '経験者' : '未経験者'}</td>
                    <td className="admin-id">{r.id}</td>
                    <td>{INITIAL_PASSWORD}</td>
                    <td>
                      <button className="btn-small" onClick={() => copyRow(r, 'member')}>
                        {copiedMemberId === r.id ? '✅' : 'コピー'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>


      {/* 正規部員一覧 */}
      <section className="admin-section">
        <h3 className="admin-subtitle">
          正規部員一覧
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            owner: {ownerExists ? 1 : 0} / 1人　admin: {adminCount} / {MAX_ADMIN}人
          </span>
        </h3>

        {roleError && (
          <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: '0.75rem' }}>{roleError}</p>
        )}

        {loading ? (
          <p>読み込み中...</p>
        ) : users.length === 0 ? (
          <p className="admin-empty">登録済みの部員はいません</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>ID</th>
                <th>role</th>
                <th>種別</th>
                <th>レベル</th>
                <th>初回PW</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(entry => (
                <tr key={entry.id}>
                  {/* 名前（インライン編集） */}
                  <td>
                    {editingId === entry.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="text" value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveName(entry); if (e.key === 'Escape') setEditingId(null) }}
                          style={{ width: 100, padding: '4px 8px', fontSize: 13 }}
                          autoFocus />
                        <button className="btn-small" onClick={() => handleSaveName(entry)}>保存</button>
                        <button className="btn-small" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <span style={{ fontWeight: 500, cursor: 'pointer', borderBottom: '1px dashed rgba(var(--ink-rgb),0.2)' }}
                        onClick={() => handleStartEditName(entry)}
                        title="クリックして編集">
                        {entry.record.name ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="admin-id">{entry.id}</td>
                  <td>
                    <span className={`role-badge role-${entry.record.role}`}>
                      {entry.record.role}
                    </span>
                  </td>
                  {/* 種別（管理専用トグル） */}
                  <td>
                    <button
                      onClick={() => handleToggleManagementOnly(entry)}
                      style={{
                        padding: '3px 8px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                        border: `1px solid ${entry.record.managementOnly ? 'rgba(var(--purple-rgb),0.4)' : 'rgba(var(--accent-rgb),0.3)'}`,
                        background: entry.record.managementOnly ? 'rgba(var(--purple-rgb),0.15)' : 'rgba(var(--accent-rgb),0.12)',
                        color: entry.record.managementOnly ? 'var(--purple)' : 'var(--accent)',
                        cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif", whiteSpace: 'nowrap',
                      }}>
                      {entry.record.managementOnly ? '管理専用' : '参加者'}
                    </button>
                  </td>
                  {/* レベル（管理専用は非表示） */}
                  <td>
                    {!entry.record.managementOnly && (
                      <button
                        onClick={() => handleToggleLevel(entry)}
                        style={{
                          padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700,
                          border: `1px solid ${entry.record.level === 'exp' ? 'rgba(var(--accent-rgb),0.3)' : 'rgba(var(--blue-rgb),0.3)'}`,
                          background: entry.record.level === 'exp' ? 'rgba(var(--accent-rgb),0.13)' : 'rgba(var(--blue-rgb),0.13)',
                          color: entry.record.level === 'exp' ? 'var(--accent)' : 'var(--blue)',
                          cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
                        }}>
                        {entry.record.level === 'exp' ? '経験者' : '未経験者'}
                      </button>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: entry.record.isFirstLogin ? 'var(--accent3)' : 'var(--text-muted)' }}>
                    {entry.record.isFirstLogin ? '未変更' : '変更済み'}
                  </td>
                  <td className="admin-actions">
                    {entry.record.role !== 'owner' && (
                      <>
                        {/* admin/member の切り替えは owner と admin が操作可能 */}
                        <button className="btn-small"
                          onClick={() => handleToggleRole(entry)}
                          title={entry.record.role === 'admin' ? 'memberに変更' : 'adminに変更（上限4人）'}>
                          {entry.record.role === 'admin' ? '→member' : '→admin'}
                        </button>
                        {/* オーナー譲渡はオーナー本人のみ操作可能 */}
                        {currentRole === 'owner' && (
                          <button className="btn-small btn-owner"
                            onClick={() => handleTransferOwner(entry)}
                            title="このユーザーにオーナーを譲渡する">
                            譲渡
                          </button>
                        )}
                      </>
                    )}
                    <button className="btn-small" onClick={() => handleResetPassword(entry)} title="PW初期化">
                      PW初期化
                    </button>
                    <button className="btn-small btn-danger" onClick={() => handleDelete(entry)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ゲスト一覧 */}
      <section className="admin-section">
        <h3 className="admin-subtitle">
          ゲスト一覧
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            {guests.length}人
          </span>
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
          登録済みのゲストにIDを再度伝えたい場合はここで確認してください。
        </p>

        {guestsLoading ? (
          <p>読み込み中...</p>
        ) : guests.length === 0 ? (
          <p className="admin-empty">登録済みのゲストはいません</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>ID</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {guests.map(entry => (
                <tr key={entry.id}>
                  <td>{entry.record.name ?? '—'}</td>
                  <td className="admin-id">{entry.id}</td>
                  <td style={{ fontSize: 12, color: entry.record.pending ? 'var(--accent3)' : 'var(--text-muted)' }}>
                    {entry.record.pending ? '日程確定待ち（ログイン不可）' : '利用可能'}
                  </td>
                  <td className="admin-actions">
                    <button className="btn-small" onClick={() => copyGuestId(entry)}>
                      {copiedGuestListId === entry.id ? '✅' : 'IDをコピー'}
                    </button>
                    <button className="btn-small btn-danger" onClick={() => openDeleteGuest(entry)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {restoreMsg && <p style={{ fontSize: 12, color: 'var(--accent)', margin: '0 0 1rem' }}>✅ {restoreMsg}</p>}

      {liveBackups.length > 0 && (
        <section className="admin-section">
          <h3 className="admin-subtitle">最近削除したゲスト（次の午前3時まで元に戻せます）</h3>
          <table className="admin-table">
            <tbody>
              {liveBackups.map(b => (
                <tr key={b.key}>
                  <td>{b.name || b.guestId}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(b.at).toLocaleString('ja-JP')}</td>
                  <td className="admin-actions">
                    <button className="btn-small" onClick={() => restoreGuest(b)} disabled={restoringKey === b.key}>
                      {restoringKey === b.key ? '復元中…' : '元に戻す'}
                    </button>
                    <button className="btn-small btn-danger" onClick={() => discardBackup(b)}>控えを破棄</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
            ※控えは管理者・オーナーだけが見られます。毎日午前3時（日本時間）の自動掃除で、控えとログイン用アカウントが完全に消えます。
          </p>
        </section>
      )}

      {/* ゲスト削除の確認ウィンドウ */}
      {deletePlan && (
        <div className="modal-overlay" onClick={() => { if (!deleting) setDeletePlan(null) }}>
          <div className="modal-card" style={{ maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>「{deletePlan.name || deletePlan.entry.id}」を削除</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              チェックを入れた項目が消えます。消した内容の控えを残し、次の午前3時（自動掃除）までは「元に戻す」ができます。
            </p>
            {!deletePlan.touchName && (
              <p style={{ fontSize: 12, color: 'var(--accent3)', marginBottom: 12 }}>
                同じ名前の別の登録（正規部員または別のゲスト）があるため、名前単位の項目（出欠・レベル・コメント・懇親会・支払い・試合）は選べません。
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {deletePlan.rows.map(r => {
                const disabled = !!r.locked || (!!r.nameKeyed && !deletePlan.touchName)
                return (
                  <label key={r.key} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px',
                    background: 'var(--surface2)', borderRadius: 'var(--radius-sm)',
                    opacity: disabled ? 0.6 : 1, cursor: disabled ? 'default' : 'pointer',
                  }}>
                    <input type="checkbox" checked={!!deleteChecks[r.key]} disabled={disabled}
                      onChange={e => setDeleteChecks(prev => ({ ...prev, [r.key]: e.target.checked }))}
                      style={{ marginTop: 3 }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                      <strong>{r.label}</strong>{r.locked ? '（必ず削除）' : ''}<br />
                      <span style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{r.value}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {deleteWarnings.length > 0 && (
              <ul style={{ fontSize: 12, color: 'var(--accent3)', paddingLeft: '1.2em', marginBottom: 12, lineHeight: 1.6 }}>
                {deleteWarnings.map(w => <li key={w}>{w}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeletePlan(null)} disabled={deleting}>キャンセル</button>
              <button className="btn-primary" onClick={executeDeleteGuest} disabled={deleting}
                style={{ background: 'var(--red)' }}>
                {deleting ? '削除中…' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
