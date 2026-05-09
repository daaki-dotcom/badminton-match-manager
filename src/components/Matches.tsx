import { useState } from 'react'
import { Match, MatchType, TierFilter, AttendanceStatus, MemberLevel, UserRole } from '../types'
import { generateSingles, generateDoubles } from '../algorithm'

interface Props {
  attendance: Record<string, AttendanceStatus>
  memberLevels: Record<string, MemberLevel>
  matches: Match[]
  courts: number
  role: UserRole
  ownerNames: string[]
  onGenerate: (matches: Match[]) => void
  onUpdateScore: (i: number, side: 1 | 2, val: string) => void
  onUpdateStatus: (i: number, val: Match['status']) => void
  onUpdateCourts: (n: number) => void
}

export function Matches({ attendance, memberLevels, matches, courts, role, ownerNames, onGenerate, onUpdateScore, onUpdateStatus, onUpdateCourts }: Props) {
  const [matchType, setMatchType]               = useState<MatchType>('singles')
  const [tierFilter, setTierFilter]             = useState<TierFilter>('all')
  const [singlesMode, setSinglesMode]           = useState<'per' | 'total' | 'none'>('per')
  const [limitPer, setLimitPer]                 = useState('')
  const [limitTotalSingles, setLimitTotalSingles] = useState('')
  const [limitTotalDoubles, setLimitTotalDoubles] = useState('')
  const [doublesMode, setDoublesMode]             = useState<'total' | 'none'>('none')
  const [ruleEqual, setRuleEqual]               = useState(true)
  const [ruleConsec, setRuleConsec]             = useState(true)
  const [detailEqual, setDetailEqual]           = useState(false)
  const [detailConsec, setDetailConsec]         = useState(false)
  const [settingsOpen, setSettingsOpen]         = useState(true)  // 生成前:展開 / 生成後:折りたたみ

  const isAdmin   = role === 'admin' || role === 'owner'
  // admin と member は試合操作（スコア・ステータス）が可能
  const canOperate = role === 'admin' || role === 'member'

  // owner は試合に参加しないため除外する
  const attendees = Object.keys(attendance)
    .filter(n => attendance[n] === 'yes' && !ownerNames.includes(n))
  const getPool = () => {
    if (tierFilter === 'exp') return attendees.filter(n => memberLevels[n] === 'exp')
    if (tierFilter === 'nov') return attendees.filter(n => memberLevels[n] !== 'exp')
    return attendees
  }

  const doneCount = matches.filter(m => m.status === 'done').length
  const pct = matches.length ? Math.round(doneCount / matches.length * 100) : 0

  const handleGenerate = () => {
    const pool = getPool()
    if (pool.length < 2) { alert('対象メンバーが2人以上いません。'); return }

    const isNoneMode = matchType === 'singles'
      ? singlesMode === 'none'
      : doublesMode === 'none'

    const opts = {
      pool, courts, matchType, ruleEqual, ruleConsec,
      limitPer: parseInt(limitPer) || 0,
      limitTotal: parseInt(matchType === 'singles' ? limitTotalSingles : limitTotalDoubles) || 0,
      isNoneMode,
    }

    const result = matchType === 'singles'
      ? generateSingles(opts)
      : generateDoubles(opts)

    if (!result) return
    const withCourts = result.map((m, i) => ({ ...m, court: (i % courts) + 1 }))
    onGenerate(withCourts)
    setSettingsOpen(false)  // 生成後は設定を折りたたむ
  }

  const tierBtns: { label: string; val: TierFilter }[] = [
    { label: '全員', val: 'all' },
    { label: '経験者のみ', val: 'exp' },
    { label: '未経験者のみ', val: 'nov' },
  ]

  return (
    <div>
      {/* コート数（admin のみ編集可） */}
      <div className="card">
        <div className="card-title">コート数</div>
        {isAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" min={1} max={20} value={courts}
              onChange={e => onUpdateCourts(parseInt(e.target.value) || 1)}
              style={{ width: 90, fontSize: 18, fontFamily: "'DM Mono', monospace", fontWeight: 500 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>コート</span>
          </div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 500 }}>{courts} コート</div>
        )}
      </div>

      {/* 試合設定カード（admin のみ・折りたたみ可） */}
      {isAdmin && (
        <div className="card">
          {/* カードヘッダー（タイトル＋折りたたみボタン） */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: settingsOpen ? '1rem' : 0,
            paddingBottom: settingsOpen ? '0.5rem' : 0,
            borderBottom: settingsOpen ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>⚙️ 試合設定</span>
            <button className="btn btn-sm" onClick={() => setSettingsOpen(v => !v)}>
              {settingsOpen ? '▲ 非表示' : '▼ 表示'}
            </button>
          </div>

          {settingsOpen && <>
          <div className="card-title" style={{ marginTop: 0 }}>参加枠</div>
          <div className="fmt-group">
            {tierBtns.map(b => (
              <button key={b.val} className={`fmt-btn ${tierFilter === b.val ? 'selected' : ''}`}
                onClick={() => setTierFilter(b.val)}>{b.label}</button>
            ))}
          </div>

          <div className="card-title">試合形式</div>
          <div className="fmt-group">
            {(['singles', 'doubles'] as MatchType[]).map(t => (
              <button key={t} className={`fmt-btn ${matchType === t ? 'selected' : ''}`}
                onClick={() => setMatchType(t)}>
                {t === 'singles' ? 'シングルス' : 'ダブルス'}
              </button>
            ))}
          </div>

          {matchType === 'singles' ? (
            <>
              <div className="card-title" style={{ marginTop: '0.75rem' }}>試合数の指定</div>
              <div className="radio-group">
                <div>
                  <div className={`radio-row ${singlesMode === 'per' ? 'active' : ''}`}>
                    <input type="radio" name="singles-mode" checked={singlesMode === 'per'}
                      onChange={() => setSinglesMode('per')} />
                    <label className="radio-label">1人あたりの試合数</label>
                  </div>
                  <div className="limit-input-wrap">
                    <input type="number" min={1} max={99} placeholder="例: 3"
                      value={limitPer} onChange={e => setLimitPer(e.target.value)}
                      disabled={singlesMode !== 'per'} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>試合</span>
                  </div>
                </div>
                <div>
                  <div className={`radio-row ${singlesMode === 'total' ? 'active' : ''}`}>
                    <input type="radio" name="singles-mode" checked={singlesMode === 'total'}
                      onChange={() => setSinglesMode('total')} />
                    <label className="radio-label">合計試合数の上限</label>
                  </div>
                  <div className="limit-input-wrap">
                    <input type="number" min={1} max={9999} placeholder="例: 10"
                      value={limitTotalSingles} onChange={e => setLimitTotalSingles(e.target.value)}
                      disabled={singlesMode !== 'total'} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>試合</span>
                  </div>
                </div>
                <div className={`radio-row ${singlesMode === 'none' ? 'active' : ''}`}>
                  <input type="radio" name="singles-mode" checked={singlesMode === 'none'}
                    onChange={() => setSinglesMode('none')} />
                  <label className="radio-label">指定しない（総当たり）</label>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="card-title" style={{ marginTop: '0.75rem' }}>試合数の指定</div>
              <div className="radio-group">
                <div>
                  <div className={`radio-row ${doublesMode === 'total' ? 'active' : ''}`}>
                    <input type="radio" name="doubles-mode" checked={doublesMode === 'total'}
                      onChange={() => setDoublesMode('total')} />
                    <label className="radio-label">合計試合数の上限</label>
                  </div>
                  <div className="limit-input-wrap">
                    <input type="number" min={1} max={9999} placeholder="例: 15"
                      value={limitTotalDoubles} onChange={e => setLimitTotalDoubles(e.target.value)}
                      disabled={doublesMode !== 'total'} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>試合</span>
                  </div>
                </div>
                <div className={`radio-row ${doublesMode === 'none' ? 'active' : ''}`}>
                  <input type="radio" name="doubles-mode" checked={doublesMode === 'none'}
                    onChange={() => setDoublesMode('none')} />
                  <label className="radio-label">指定しない（全員4試合完了で終了）</label>
                </div>
              </div>
            </>
          )}

          <div className="card-title" style={{ marginTop: '0.75rem' }}>ルール設定</div>
          <div style={{ marginBottom: '1rem' }}>
            {[
              { key: 'equal', label: '均等にする', val: ruleEqual, set: setRuleEqual, detail: detailEqual, setDetail: setDetailEqual, desc: '全員の試合数が同じになるように生成します。均等にできない試合数が指定された場合は警告を表示します。' },
              { key: 'consec', label: '連続不可にする', val: ruleConsec, set: setRuleConsec, detail: detailConsec, setDetail: setDetailConsec, desc: '同じ人が連続して試合しないように生成します。コート数に対して人数がちょうどの場合は自動的に緩和されます。' },
            ].map(r => (
              <div className="rule-toggle-row" key={r.key}>
                <div>
                  <div className="rule-toggle-label">{r.label}</div>
                  <button className="rule-detail-btn" onClick={() => r.setDetail(!r.detail)}>
                    {r.detail ? '▲ 説明を非表示' : '▼ 説明を表示'}
                  </button>
                  {r.detail && <div className="rule-detail">{r.desc}</div>}
                </div>
                <div className={`toggle-switch ${r.val ? 'on' : ''}`} onClick={() => r.set(!r.val)}>
                  <div className="toggle-knob" />
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-accent" style={{ width: '100%' }} onClick={handleGenerate}>
            組み合わせを生成
          </button>
          </>}
        </div>
      )}

      {matches.length > 0 && (
        <div className="card">
          <div className="card-title">進行状況</div>
          <div className="progress-wrap">
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-label">
              <span>{doneCount} / {matches.length} 試合終了</span>
              <span>{pct}%</span>
            </div>
          </div>
        </div>
      )}

      {matches.length === 0 ? (
        <div className="empty">試合がありません</div>
      ) : (
        // courts 数ごとに1ラウンドとしてグループ化する
        Array.from({ length: Math.ceil(matches.length / courts) }, (_, ri) => {
          const start  = ri * courts
          const round  = matches.slice(start, start + courts)
          const allDone   = round.every(m => m.status === 'done')
          const anyPlay   = round.some(m => m.status === 'playing')
          return (
            <div key={ri} className="round-group">
              <div className={`round-header ${allDone ? 'done' : anyPlay ? 'playing' : ''}`}>
                <span className="round-label">ラウンド {ri + 1}</span>
                <span className="round-status">
                  {allDone ? '✅ 終了' : anyPlay ? '🟡 試合中' : '⏸ 待機中'}
                </span>
              </div>
              {round.map((m, si) => {
                const i = start + si
                return (
                  <div key={i} className={`match-item ${m.status}`}>
                    <div className="match-left">
                      <div className="match-team">{m.p1}</div>
                      <div className="match-meta">C{m.court}</div>
                      <div className="match-team">{m.p2}</div>
                    </div>
                    <div className="match-right">
                      {canOperate ? (
                        <>
                          <div className="match-score">
                            <input type="number" min={0} max={99} value={m.s1} placeholder="0"
                              onChange={e => onUpdateScore(i, 1, e.target.value)} />
                            <span className="vs">vs</span>
                            <input type="number" min={0} max={99} value={m.s2} placeholder="0"
                              onChange={e => onUpdateScore(i, 2, e.target.value)} />
                          </div>
                          <div className="match-status-row">
                            <select className="status-sel" value={m.status}
                              onChange={e => onUpdateStatus(i, e.target.value as Match['status'])}>
                              <option value="wait">待機中</option>
                              <option value="playing">試合中</option>
                              <option value="done">終了</option>
                            </select>
                          </div>
                        </>
                      ) : (
                        <div className="match-score-readonly">
                          <span className="score-num">{m.s1 || '—'}</span>
                          <span className="vs">vs</span>
                          <span className="score-num">{m.s2 || '—'}</span>
                          <span className={`badge badge-${m.status}`} style={{ marginLeft: 8 }}>
                            {m.status === 'done' ? '終了' : m.status === 'playing' ? '試合中' : '待機'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
      )}

      {/* リセット（admin のみ） */}
      {isAdmin && matches.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <button className="btn btn-sm btn-danger"
            onClick={() => confirm('試合データをリセットしますか？') && onGenerate([])}>
            試合をリセット
          </button>
        </div>
      )}
    </div>
  )
}
