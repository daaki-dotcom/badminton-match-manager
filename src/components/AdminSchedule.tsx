import { useState, useEffect } from 'react'
import { ref, onValue, set, update, get } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { ChouseisanEntry } from '../types'

const SYMBOL: Record<string, string> = { yes: '○', no: '✕', undecided: '△' }

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// YYYY-MM-DD 形式のキーを作る（toISOString等のUTC変換だとローカルの日付とずれるため使わない）
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 指定した月を、日曜始まりの週ごとの配列にする（月の前後は null で埋める）
const buildMonthGrid = (monthDate: Date): (Date | null)[][] => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function AdminSchedule() {
  const [activityDate, setActivityDate]     = useState('')
  const [candidateDates, setCandidateDates] = useState<string[]>([])
  const [entries, setEntries]               = useState<ChouseisanEntry[]>([])
  const [calendarMonth, setCalendarMonth]   = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [selectedDates, setSelectedDates]   = useState<Set<string>>(new Set())
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

  const toggleDateSelection = (key: string) => {
    if (candidateDates.includes(key)) return
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addSelectedDates = async () => {
    if (selectedDates.size === 0) return
    const next = [...new Set([...candidateDates, ...selectedDates])].sort()
    await set(ref(db, `${ROOT}/candidateDates`), next)
    setSelectedDates(new Set())
  }

  const changeMonth = (diff: number) => {
    setCalendarMonth(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + diff)
      return d
    })
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
    const pendingReleaseIds: string[] = []

    for (const e of entries) {
      const a = e.answers[date]
      if (!a) continue
      attendanceUpdate[e.name] = a
      commentUpdate[e.name] = e.comment
      if (a === 'yes' && e.memberType === 'guest') {
        levelUpdate[e.name] = e.level
      }
      if (a === 'yes' && e.linkedGuestId) {
        pendingReleaseIds.push(e.linkedGuestId)
      }
    }

    // 仮登録ゲストIDのロック解除は、1人ずつ順番にではなく全員分まとめて並列で行う
    await Promise.all(pendingReleaseIds.map(async id => {
      const snap = await get(ref(db, `${ROOT}/guestUsers/${id}`))
      if (snap.exists()) {
        await update(ref(db, `${ROOT}/guestUsers/${id}`), { pending: false })
      }
    }))

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
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            カレンダーから候補日を複数クリックして選び、まとめて追加できます。
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button className="btn-small" onClick={() => changeMonth(-1)}>◀ 前月</button>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
            </span>
            <button className="btn-small" onClick={() => changeMonth(1)}>次月 ▶</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
            {WEEKDAY_LABELS.map(w => (
              <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>{w}</div>
            ))}
            {buildMonthGrid(calendarMonth).flat().map((day, i) => {
              if (!day) return <div key={i} />
              const key = dateKey(day)
              const alreadyAdded = candidateDates.includes(key)
              const isSelected = selectedDates.has(key)
              return (
                <button key={i} type="button"
                  onClick={() => toggleDateSelection(key)}
                  disabled={alreadyAdded}
                  title={alreadyAdded ? '追加済み' : key}
                  style={{
                    padding: '6px 0', borderRadius: 6, fontSize: 12, textAlign: 'center',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
                    background: alreadyAdded ? 'rgba(255,255,255,0.05)' : isSelected ? 'rgba(110,231,183,0.2)' : 'transparent',
                    color: alreadyAdded ? 'var(--text-muted)' : isSelected ? 'var(--accent)' : 'var(--text)',
                    cursor: alreadyAdded ? 'default' : 'pointer',
                    fontFamily: "'Noto Sans JP', sans-serif",
                  }}>
                  {day.getDate()}
                </button>
              )
            })}
          </div>
          <button className="btn-primary" onClick={addSelectedDates} disabled={selectedDates.size === 0}>
            選択した候補日を追加する（{selectedDates.size}件）
          </button>

          {candidateDates.length === 0 ? (
            <p className="admin-empty" style={{ marginTop: '0.75rem' }}>候補日が未設定です。追加すると回答フォームに反映されます。</p>
          ) : (
            <table className="admin-table" style={{ marginTop: '0.75rem' }}>
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
