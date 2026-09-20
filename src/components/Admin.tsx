import { useState, useEffect } from 'react'
import { ref, get, set, remove, update, onValue } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { hashPassword, generateGuestId } from '../auth'
import { UserRecord, GuestUserRecord, MemberLevel } from '../types'

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

  // ゲスト 一括登録
  const [guestPreview,  setGuestPreview]  = useState<CsvRow[]>([])
  const [guestIssued,   setGuestIssued]   = useState<IssuedRow[]>([])
  const [guestCsvError, setGuestCsvError] = useState('')
  const [guestBulkLoading, setGuestBulkLoading] = useState(false)
  const [copiedGuestId,  setCopiedGuestId]  = useState<string | null>(null)
  const [copiedAllGuest, setCopiedAllGuest] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    const snap = await get(ref(db, `${ROOT}/users`))
    if (snap.exists()) {
      const data = snap.val() as Record<string, UserRecord>
      setUsers(Object.entries(data).map(([id, record]) => ({ id, record })))
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
    return () => unsub()
  }, [])

  const handleSaveDate = async () => {
    await set(ref(db, `${ROOT}/activityDate`), dateInput)
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 2000)
  }

  const handleIssueId = async () => {
    const trimmedName = newName.trim()
    if (!trimmedName) { setNameError('名前を入力してください'); return }
    setNameError('')
    const id   = generateRandomId()
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

  const handleResetPassword = async (entry: UserEntry) => {
    if (!confirm(`${entry.record.name ?? entry.id} のパスワードを初期化しますか？\n次回ログイン時にパスワード変更が求められます。`)) return
    const hash = await hashPassword(INITIAL_PASSWORD)
    await update(ref(db, `${ROOT}/users/${entry.id}`), { passwordHash: hash, isFirstLogin: true })
    await fetchUsers()
  }

  // CSVテキストをパースして名前・レベルの配列を返す
  const parseCSV = (text: string): { rows: CsvRow[]; error: string } => {
    // BOM除去 + 改行正規化
    const lines = text.replace(/^﻿/, '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
    const rows: CsvRow[] = []
    for (const line of lines) {
      const [name, levelStr] = line.split(',').map(s => s.trim())
      if (!name || name === '名前') continue
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

  const handleGuestCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    readCSVFile(file, (rows, error) => {
      setGuestPreview(rows)
      setGuestCsvError(error)
      setGuestIssued([])
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

  const handleBulkIssueGuest = async () => {
    setGuestBulkLoading(true)
    try {
      const hash = await hashPassword(INITIAL_PASSWORD)
      const issued: IssuedRow[] = []
      for (const row of guestPreview) {
        const id = generateGuestId()
        await set(ref(db, `${ROOT}/guestUsers/${id}`), {
          passwordHash: hash,
          name: row.name,
        } satisfies GuestUserRecord)
        await set(ref(db, `${ROOT}/attendance/${row.name}`), 'yes')
        issued.push({ name: row.name, id, level: row.level })
      }
      setGuestIssued(issued)
      setGuestPreview([])
    } finally {
      setGuestBulkLoading(false)
    }
  }

  const copyRow = (row: IssuedRow, type: 'member' | 'guest') => {
    navigator.clipboard.writeText(`${row.name}  ID: ${row.id}  PW: ${INITIAL_PASSWORD}`)
    if (type === 'member') { setCopiedMemberId(row.id); setTimeout(() => setCopiedMemberId(null), 2000) }
    else                   { setCopiedGuestId(row.id);  setTimeout(() => setCopiedGuestId(null),  2000) }
  }

  const copyAll = (issued: IssuedRow[], type: 'member' | 'guest') => {
    const text = issued.map(r => `${r.name}  ID: ${r.id}  PW: ${INITIAL_PASSWORD}`).join('\n')
    navigator.clipboard.writeText(text)
    if (type === 'member') { setCopiedAllMember(true); setTimeout(() => setCopiedAllMember(false), 2000) }
    else                   { setCopiedAllGuest(true);  setTimeout(() => setCopiedAllGuest(false),  2000) }
  }

  const handleDelete = async (entry: UserEntry) => {
    if (!confirm(`${entry.record.name ?? entry.id} を削除しますか？`)) return
    await remove(ref(db, `${ROOT}/users/${entry.id}`))
    await fetchUsers()
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

      {/* ゲスト 一括登録 */}
      <section className="admin-section">
        <h3 className="admin-subtitle">ゲスト 一括登録（CSV）</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
          フォーマット：<code>名前,レベル</code>（活動日終了後に自動削除）
        </p>
        <input type="file" accept=".csv" onChange={handleGuestCSV} style={{ fontSize: 13 }} />
        {guestCsvError && <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{guestCsvError}</p>}

        {guestPreview.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>プレビュー（{guestPreview.length}件）</p>
            <table className="admin-table">
              <thead><tr><th>名前</th><th>レベル</th></tr></thead>
              <tbody>
                {guestPreview.map((r, i) => (
                  <tr key={i}><td>{r.name}</td><td>{r.level === 'exp' ? '経験者' : '未経験者'}</td></tr>
                ))}
              </tbody>
            </table>
            <button className="btn-primary" style={{ marginTop: '0.75rem' }}
              onClick={handleBulkIssueGuest} disabled={guestBulkLoading}>
              {guestBulkLoading ? '発行中...' : `${guestPreview.length}人を一括発行する`}
            </button>
          </div>
        )}

        {guestIssued.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <p style={{ fontSize: 12, color: 'var(--accent)' }}>✅ {guestIssued.length}件 発行完了</p>
              <button className="btn-copy" onClick={() => copyAll(guestIssued, 'guest')}>
                {copiedAllGuest ? 'コピーしました！' : '全部コピー'}
              </button>
            </div>
            <table className="admin-table">
              <thead><tr><th>名前</th><th>レベル</th><th>ID</th><th>PW</th><th></th></tr></thead>
              <tbody>
                {guestIssued.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.level === 'exp' ? '経験者' : '未経験者'}</td>
                    <td className="admin-id">{r.id}</td>
                    <td>{INITIAL_PASSWORD}</td>
                    <td>
                      <button className="btn-small" onClick={() => copyRow(r, 'guest')}>
                        {copiedGuestId === r.id ? '✅' : 'コピー'}
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
                      <span style={{ fontWeight: 500, cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.2)' }}
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
                        border: `1px solid ${entry.record.managementOnly ? 'rgba(167,139,250,0.4)' : 'rgba(110,231,183,0.3)'}`,
                        background: entry.record.managementOnly ? 'rgba(167,139,250,0.15)' : 'rgba(110,231,183,0.12)',
                        color: entry.record.managementOnly ? '#a78bfa' : 'var(--accent)',
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
                          border: `1px solid ${entry.record.level === 'exp' ? 'rgba(110,231,183,0.3)' : 'rgba(96,165,250,0.3)'}`,
                          background: entry.record.level === 'exp' ? 'rgba(110,231,183,0.13)' : 'rgba(96,165,250,0.13)',
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
    </div>
  )
}
