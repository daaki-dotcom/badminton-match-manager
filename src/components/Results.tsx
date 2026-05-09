import { Match, AttendanceStatus, MemberLevel } from '../types'

interface Props {
  attendance: Record<string, AttendanceStatus>
  memberLevels: Record<string, MemberLevel>
  matches: Match[]
}

export function Results({ attendance, memberLevels, matches }: Props) {
  const attendees = Object.keys(attendance).filter(n => attendance[n] === 'yes')

  if (!matches.length) {
    return <div className="empty">試合を組み合わせてから結果を入力してください</div>
  }

  const wins: Record<string, { w: number; l: number; d: number; pts: number; pf: number; pa: number }> = {}
  attendees.forEach(n => { wins[n] = { w: 0, l: 0, d: 0, pts: 0, pf: 0, pa: 0 } })

  matches.forEach(m => {
    if (m.status !== 'done') return
    const s1 = parseInt(m.s1) || 0, s2 = parseInt(m.s2) || 0
    const p1 = m.p1.split(' / '), p2 = m.p2.split(' / ')
    p1.forEach(p => { if (wins[p]) { wins[p].pf += s1; wins[p].pa += s2 } })
    p2.forEach(p => { if (wins[p]) { wins[p].pf += s2; wins[p].pa += s1 } })
    if (s1 > s2) {
      p1.forEach(p => { if (wins[p]) { wins[p].w++; wins[p].pts += 2 } })
      p2.forEach(p => { if (wins[p]) wins[p].l++ })
    } else if (s2 > s1) {
      p2.forEach(p => { if (wins[p]) { wins[p].w++; wins[p].pts += 2 } })
      p1.forEach(p => { if (wins[p]) wins[p].l++ })
    } else {
      p1.forEach(p => { if (wins[p]) { wins[p].d++; wins[p].pts++ } })
      p2.forEach(p => { if (wins[p]) { wins[p].d++; wins[p].pts++ } })
    }
  })

  const ranked = [...attendees].sort((a, b) =>
    wins[b]?.pts - wins[a]?.pts || wins[b]?.w - wins[a]?.w ||
    (wins[b]?.pf - wins[b]?.pa) - (wins[a]?.pf - wins[a]?.pa)
  )

  const done = matches.filter(m => m.status === 'done').length
  const playing = matches.filter(m => m.status === 'playing').length
  const pct = Math.round(done / matches.length * 100)

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num">{matches.length}</div><div className="stat-label">総試合数</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent)' }}>{done}</div><div className="stat-label">終了</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent3)' }}>{playing}</div><div className="stat-label">試合中</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--text-muted)' }}>{matches.length - done - playing}</div><div className="stat-label">残り</div></div>
      </div>

      <div className="card">
        <div className="card-title">進行状況</div>
        <div className="progress-wrap">
          <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
          <div className="progress-label"><span>{done} / {matches.length} 試合終了</span><span>{pct}%</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">順位表</div>
        {ranked.map((n, i) => {
          const w = wins[n]
          const isExp = memberLevels[n] === 'exp'
          return (
            <div className="rank-row" key={n}>
              <div className={`rank-pos ${i < 3 ? 'top' : ''}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}位`}
              </div>
              <div className="rank-name">
                <div>{n}</div>
                <div style={{ marginTop: 3 }}>
                  <span className={isExp ? 'badge-exp' : 'badge-nov'}>{isExp ? '経験者' : '未経験者'}</span>
                </div>
              </div>
              <div className="rank-wl">{w?.w ?? 0}勝{w?.l ?? 0}敗{w?.d ? `${w.d}分` : ''}</div>
              <div className="rank-pts">{w?.pts ?? 0}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>pt</span></div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
        勝利 +2pt ／ 引き分け +1pt ／ 敗北 +0pt
      </div>
    </div>
  )
}
