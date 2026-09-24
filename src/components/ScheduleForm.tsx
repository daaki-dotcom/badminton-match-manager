import { useState, useEffect } from 'react'
import { ref, onValue, push, set, update } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { hashPassword, generateGuestId, createAuthAccount } from '../auth'
import { ChouseisanEntry, AttendanceStatus, MemberLevel, UserRecord, GuestUserRecord } from '../types'

const INITIAL_PASSWORD = 'boldbad'
const SYMBOL: Record<AttendanceStatus, string> = { yes: '○', no: '✕', undecided: '△', '': '？' }
const CYCLE: AttendanceStatus[] = ['yes', 'no', 'undecided']

const normalize = (s: string) => s.replace(/[ 　]/g, '').trim()

interface Props {
  onBack: () => void
}

export function ScheduleForm({ onBack }: Props) {
  const [activityDate, setActivityDate]     = useState('')
  const [candidateDates, setCandidateDates] = useState<string[]>([])
  const [entries, setEntries]               = useState<ChouseisanEntry[]>([])
  const [memberNames, setMemberNames]       = useState<string[]>([])
  const [loading, setLoading]               = useState(true)

  useEffect(() => {
    const unsub1 = onValue(ref(db, `${ROOT}/activityDate`), s => setActivityDate(s.val() || ''))
    const unsub2 = onValue(ref(db, `${ROOT}/candidateDates`), s => setCandidateDates(s.val() ? Object.values(s.val()) as string[] : [])) 
    const unsub3 = onValue(ref(db, `${ROOT}/chouseisanEntries`), s => {
      const data = s.val() as Record<string, ChouseisanEntry> | null
      setEntries(data ? Object.values(data) : [])
    })
    const unsub4 = onValue(ref(db, `${ROOT}/users`), s => {
      const data = s.val() as Record<string, UserRecord> | null
      setMemberNames(data ? Object.values(data).filter(u => !u.managementOnly).map(u => u.name) : [])
      setLoading(false)
    })
    return () => { unsub1(); unsub2(); unsub3(); unsub4() }
  }, [])

  const mode: 'single' | 'multi' = activityDate ? 'single' : 'multi'
  const dateKeys = mode === 'single' ? ['single'] : candidateDates
  const dateLabels = mode === 'single' ? [activityDate] : candidateDates

  const isActivityEnded = mode === 'single' && !!activityDate && (() => {
    const d = new Date(activityDate)
    d.setHours(23, 59, 59, 999)
    return Date.now() > d.getTime()
  })()

  // ── 入力フォームの状態 ──
  const [name, setName]           = useState('')
  const [answers, setAnswers]     = useState<Record<string, AttendanceStatus>>({})
  const [memberType, setMemberType] = useState<'member' | 'guest'>('guest')
  const [level, setLevel]         = useState<MemberLevel>('nov')
  const [comment, setComment]     = useState('')

  const [step, setStep] = useState<'form' | 'confirm' | 'dup' | 'done'>('form')
  const [dupTarget, setDupTarget] = useState<ChouseisanEntry | null>(null)
  const [resultMessage, setResultMessage] = useState('')
  const [issuedId, setIssuedId] = useState('')

  const cycleAnswer = (key: string) => {
    setAnswers(prev => {
      const cur = prev[key] || 'yes'
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]
      return { ...prev, [key]: next }
    })
  }

  const answerFor = (key: string): AttendanceStatus => answers[key] || 'yes'

  const goConfirm = () => {
    if (!name.trim()) return
    setStep('confirm')
  }

  const persistEntry = async (entryId: string | null, isUpdate: boolean) => {
    const now = Date.now()
    const normalized = normalize(name)
    const isMember = memberNames.some(n => normalize(n) === normalized)
    const finalAnswers: Record<string, AttendanceStatus> = {}
    dateKeys.forEach(k => { finalAnswers[k] = answerFor(k) })

    const id = entryId ?? (push(ref(db, `${ROOT}/chouseisanEntries`)).key as string)
    let linkedGuestId: string | undefined
    let msg = ''
    let newIssuedId = ''

    if (isMember) {
      // 正規部員：出欠のみ反映、レベルは上書きしない
      if (mode === 'single') {
        await update(ref(db, `${ROOT}/attendance`), { [name.trim()]: finalAnswers.single })
        await update(ref(db, `${ROOT}/attendanceComments`), { [name.trim()]: comment })
        msg = '既存の会員情報に出欠を反映しました。レベルはログイン後にのみ変更できます。'
      } else {
        msg = '回答を受け付けました。日程確定後に反映されます。'
      }
    } else {
      // ゲスト
      if (mode === 'single') {
        await update(ref(db, `${ROOT}/attendance`), { [name.trim()]: finalAnswers.single })
        await update(ref(db, `${ROOT}/attendanceComments`), { [name.trim()]: comment })
        await update(ref(db, `${ROOT}/memberLevels`), { [name.trim()]: level })
        if (finalAnswers.single === 'yes') {
          const guestId = generateGuestId()
          await createAuthAccount(guestId, INITIAL_PASSWORD)
          const hash = await hashPassword(INITIAL_PASSWORD)
          await set(ref(db, `${ROOT}/guestUsers/${guestId}`), {
            passwordHash: hash, name: name.trim(),
          } satisfies GuestUserRecord)
          linkedGuestId = guestId
          newIssuedId = guestId
          msg = '出欠情報をサイトに反映し、参加者IDを新規発行しました。'
        } else {
          msg = '回答内容を記録しました。（今回はIDの発行はありません）'
        }
      } else {
        const anyYes = Object.values(finalAnswers).some(a => a === 'yes')
        if (anyYes) {
          const guestId = generateGuestId()
          await createAuthAccount(guestId, INITIAL_PASSWORD)
          const hash = await hashPassword(INITIAL_PASSWORD)
          await set(ref(db, `${ROOT}/guestUsers/${guestId}`), {
            passwordHash: hash, name: name.trim(), pending: true,
          } satisfies GuestUserRecord)
          linkedGuestId = guestId
          newIssuedId = guestId
          msg = '回答を受け付けました。あなたの回答日が活動日として確定すると、発行済みの参加者IDでログインできるようになります。'
        } else {
          msg = '回答を受け付けました。日程確定の際に候補日ごとの集計に反映されます。'
        }
      }
    }

    const entry: ChouseisanEntry = {
      id,
      name: name.trim(),
      memberType: isMember ? 'member' : 'guest',
      level,
      comment,
      mode,
      answers: finalAnswers,
      linkedGuestId,
      createdAt: isUpdate ? (entries.find(e => e.id === id)?.createdAt ?? now) : now,
      updatedAt: now,
    }
    await set(ref(db, `${ROOT}/chouseisanEntries/${id}`), entry)

    setResultMessage(msg)
    setIssuedId(newIssuedId)
    setStep('done')
  }

  const handleSubmit = async () => {
    const normalized = normalize(name)
    const existing = entries.find(e => normalize(e.name) === normalized)
    if (existing) {
      setDupTarget(existing)
      setStep('dup')
      return
    }
    await persistEntry(null, false)
  }

  const handleDupYes = async () => {
    if (!dupTarget) return
    await persistEntry(dupTarget.id, true)
  }

  const handleDupNo = async () => {
    await persistEntry(null, false)
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <div className="loading-text">接続中...</div>
      </div>
    )
  }

  if (mode === 'single' && isActivityEnded) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">📝 出欠回答フォーム</h1>
          <p className="login-notice">活動は終了しました。このフォームでの回答受付は締め切りました。</p>
          <button className="login-btn-guest" onClick={onBack}>ログイン画面に戻る</button>
        </div>
      </div>
    )
  }

  if (mode === 'multi' && dateKeys.length === 0) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">📝 出欠回答フォーム</h1>
          <p className="login-notice">現在、候補日が設定されていません。管理者が候補日を設定するまでお待ちください。</p>
          <button className="login-btn-guest" onClick={onBack}>ログイン画面に戻る</button>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">✅ 送信しました</h1>
          <p className="login-notice">{resultMessage}</p>
          {issuedId && (
            <div className="admin-issued">
              <p className="admin-issued-text">あなたのID: <strong style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{issuedId}</strong></p>
              <p className="admin-issued-text">初期パスワード: <strong>{INITIAL_PASSWORD}</strong></p>
            </div>
          )}
          <button className="login-btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={onBack}>ログイン画面に戻る</button>
        </div>
      </div>
    )
  }

  if (step === 'dup') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">⚠️ 確認</h1>
          <p className="login-notice">
            「{name.trim()}」という名前の回答がすでにあります。同じ方の回答内容を更新しますか？<br />
            別の方の場合は「いいえ」を選んでください（管理者が確認します）。
          </p>
          <button className="login-btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={handleDupYes}>はい（自分の回答を更新する）</button>
          <button className="login-btn-guest" onClick={handleDupNo}>いいえ（別人として新規登録する）</button>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">この内容で送信します</h1>
          <div className="admin-issued" style={{ textAlign: 'left' }}>
            <p className="admin-issued-text">名前：{name}</p>
            {dateKeys.map((k, i) => (
              <p className="admin-issued-text" key={k}>
                {mode === 'single' ? '出欠' : dateLabels[i]}：{SYMBOL[answerFor(k)]}
              </p>
            ))}
            <p className="admin-issued-text">種別：{memberType === 'member' ? '正規部員' : 'ゲスト'}</p>
            <p className="admin-issued-text">レベル：{level === 'exp' ? '経験者' : '未経験者'}</p>
            <p className="admin-issued-text">コメント：{comment || '（なし）'}</p>
          </div>
          <button className="login-btn-primary" style={{ width: '100%', marginTop: '1rem', marginBottom: 8 }} onClick={handleSubmit}>この内容で送信する</button>
          <button className="login-btn-guest" onClick={() => setStep('form')}>修正する</button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <h1 className="login-title">📝 出欠回答フォーム</h1>
        <p className="login-notice">
          {mode === 'single' ? `${activityDate} の練習に参加できるか教えてください。` : '候補日ごとに参加できるか教えてください。'}
          ログインは不要です。
        </p>

        <label className="login-label">
          お名前
          <input className="login-input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例：山田太郎" />
        </label>

        <div style={{ margin: '0.75rem 0' }}>
          <div className="login-label" style={{ marginBottom: 6 }}>参加意思（クリックで切り替え）</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dateKeys.map((k, i) => (
              <button key={k} type="button" className="btn"
                onClick={() => cycleAnswer(k)}
                style={{ flex: '1 1 auto', minWidth: 80 }}>
                {mode === 'multi' ? `${dateLabels[i]}：` : ''}{SYMBOL[answerFor(k)]}
              </button>
            ))}
          </div>
        </div>

        <label className="login-label">
          種別
          <select className="login-input" value={memberType} onChange={e => setMemberType(e.target.value as 'member' | 'guest')}>
            <option value="guest">ゲスト</option>
            <option value="member">正規部員</option>
          </select>
        </label>

        <label className="login-label">
          レベル
          <select className="login-input" value={level} onChange={e => setLevel(e.target.value as MemberLevel)}>
            <option value="nov">未経験者</option>
            <option value="exp">経験者</option>
          </select>
        </label>

        <label className="login-label">
          コメント（任意）
          <input className="login-input" type="text" value={comment} onChange={e => setComment(e.target.value)} placeholder="例：19時から参加できます" />
        </label>

        <button className="login-btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={goConfirm}>回答する</button>

        <div className="login-divider">または</div>
        <button className="login-btn-guest" type="button" onClick={onBack}>ログイン画面に戻る</button>
      </div>
    </div>
  )
}
