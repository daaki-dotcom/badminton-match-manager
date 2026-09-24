import { useState, useEffect } from 'react'
import { ref, onValue, set, update, get } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { ChouseisanEntry, GuestUserRecord } from '../types'

const SYMBOL: Record<string, string> = { yes: '○', no: '✕', undecided: '△' }

export function AdminSchedule() {
  const [activityDate, setActivityDate]     = useState('')
  const [candidateDates, setCandidateDates] = useState<string[]>([])
  const [entries, setEntries]               = useState<ChouseisanEntry[]>([])
  const [newDate, setNewDate]               = useState('')
  const [confirming, setConfirming]         = useState<string | null>(null)
  const [confirmedMsg, setConfirmedMsg]     = useState('')

  useEffect(() => {
    const u1 = onValue(ref(db, `${ROOT}/activityDate`), s => setActivityDate(s.val() || ''))
    const u2 = onValue(ref(db, `${ROOT}/candidateDates`), s => setCandidateDates(s.val() ? Object.values(s.val()) as string[] : []))
    const u3 = onValue(ref(db, `${ROOT}/chouseisanEntries`), s => {
      const data = s.val() as Record<string, ChouseisanEntry> | null
      setEntries(data ? Object.values(data) : [])
    })
    return () => { u1(); u2(); u3() }
  }, [])

  const mode: 'single' | 'multi' = activityDate ? 'single' : 'multi'

  const addCandidateDate = async () => {
    if (!newDate || candidateDates.includes(newDate)) return
    const next = [...candidateDates, newDate].sort()
    await set(ref(db, `${ROOT}/candidateDates`), next)
    setNewDate('')
  }

  const removeCandidateDate = async (d: string) => {
    const next = candidateDates.filter(x => x !== d)
    await set(ref(db, `${ROOT}/candidateDates`), next)
  }

  const countsFor = (date: string) => {
    let yes = 0, no = 0, undecided = 0
    entries.forEach(e => {
      const a = e.answers[date]
      if (a === 'yes') yes++
      else if (a === 'no') no++
      else if (a === 'undecided') undecided++
    })
    return { yes, no, undecided }
  }

  const handleConfirmDate = async (date: string) => {
    if (!confirm(`${date} を活動日として確定します。よろしいですか？`)) return
    setConfirming(date)

    // 当日◯回答者を反映：出欠・レベルを書き込み、仮ゲストIDのロックを解除
    const attendanceUpdate: Record<string, string> = {}
    const levelUpdate: Record<string, string> = {}
    const commentUpdate: Record<string, string> = {}

    for (const e of entries) {
      const a = e.answers[date]
      if (!a) continue
      attendanceUpdate[e.name] = a
      commentUpdate[e.name] = e.comment
      if (a === 'yes' && e.memberType === 'guest') {
        levelUpdate[e.name] = e.level
      }
      if (e.linkedGuestId) {
        const snap = await get(ref(db, `${ROOT}/guestUsers/${e.linkedGuestId}`))
        if (snap.exists()) {
          const rec = snap.val() as GuestUserRecord
          if (a === 'yes') {
            await update(ref(db, `${ROOT}/guestUsers/${e.linkedGuestId}`), { pending: false })
          } else if (rec.pending) {
            // 確定日に◯でなかった仮IDはロックされたまま（このアカウントは使われない）
          }
        }
      }
    }

    if (Object.keys(attendanceUpdate).length > 0) await update(ref(db, `${ROOT}/attendance`), attendanceUpdate)
    if (Object.keys(commentUpdate).length > 0) await update(ref(db, `${ROOT}/attendanceComments`), commentUpdate)
    if (Object.keys(levelUpdate).length > 0) await update(ref(db, `${ROOT}/memberLevels`), levelUpdate)
    await set(ref(db, `${ROOT}/activityDate`), date)
    await set(ref(db, `${ROOT}/candidateDates`), [])

    setConfirming(null)
    setConfirmedMsg(`${date} を活動日として確定しました。`)
  }

  // 同姓同名（要確認）の検出：正規化名が一致する2件以上のエントリ
  const normalize = (s: string) => s.replace(/[ 　]/g, '')
  const dupGroups = (() => {
    const map = new Map<string, ChouseisanEntry[]>()
    entries.forEach(e => {
      const key = normalize(e.name)
      map.set(key, [...(map.get(key) ?? []), e])
    })
    return [...map.values()].filter(g => g.length > 1)
  })()

  return (
    <section className="admin-section">
      <h3 className="admin-subtitle">日程調整</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
        ログイン画面の「出欠を回答する」フォームで集まった回答をここで確認します。
        活動日が未設定の間は複数候補日モード（下で候補日を追加してください）、設定済みなら単一日程モードとして動作します。
      </p>

      {confirmedMsg && <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: '0.75rem' }}>✅ {confirmedMsg}</p>}

      {mode === 'multi' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ minWidth: 160 }} />
            <button className="btn-primary" onClick={addCandidateDate}>候補日を追加</button>
          </div>
          {candidateDates.length === 0 ? (
            <p className="admin-empty">候補日が未設定です。追加すると回答フォームに反映されます。</p>
          ) : (
            <table className="admin-table">
              <thead><tr><th>候補日</th><th>○</th><th>△</th><th>✕</th><th></th></tr></thead>
              <tbody>
                {candidateDates.map(d => {
                  const c = countsFor(d)
                  return (
                    <tr key={d}>
                      <td>{d}</td>
                      <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{c.yes}</td>
                      <td style={{ color: 'var(--accent3)' }}>{c.undecided}</td>
                      <td style={{ color: 'var(--red)' }}>{c.no}</td>
                      <td>
                        <button className="btn-small" onClick={() => handleConfirmDate(d)} disabled={confirming === d}>
                          {confirming === d ? '確定中...' : 'この日で確定する'}
                        </button>
                        <button className="btn-small btn-danger" onClick={() => removeCandidateDate(d)}>削除</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        回答一覧（{entries.length}件）
      </p>
      {entries.length === 0 ? (
        <p className="admin-empty">まだ回答がありません</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>名前</th><th>種別</th><th>レベル</th><th>回答</th><th>コメント</th></tr></thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td style={{ fontSize: 12 }}>{e.memberType === 'member' ? '正規部員' : 'ゲスト'}</td>
                <td style={{ fontSize: 12 }}>{e.level === 'exp' ? '経験者' : '未経験者'}</td>
                <td style={{ fontSize: 12 }}>
                  {Object.entries(e.answers).map(([k, v]) => `${mode === 'single' ? '' : k + ':'}${SYMBOL[v] ?? '?'}`).join('　')}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dupGroups.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: 12, color: 'var(--accent3)', marginBottom: 6 }}>⚠️ 同姓同名の回答あり・要確認（{dupGroups.length}組）</p>
          {dupGroups.map((g, i) => (
            <p key={i} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              「{g[0].name}」が{g.length}件あります。別人か本人の入力ミスか、内容を見て判断してください。
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
