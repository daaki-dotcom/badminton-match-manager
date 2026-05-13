import { useState } from 'react'
import { AttendanceStatus, PartyStatus, UserRole } from '../types'

interface Props {
  attendance: Record<string, AttendanceStatus>
  party: Record<string, PartyStatus>
  role: UserRole
  authUserName?: string
  maskMap: Record<string, string>
  onSetParty: (name: string, val: PartyStatus) => void
  onResetParty: () => void
}

export function Party({ attendance, party, role, authUserName, maskMap, onSetParty, onResetParty }: Props) {
  const d = (name: string) => maskMap[name] ?? name
  const [showAll, setShowAll] = useState(false)

  const attendees    = Object.keys(attendance).filter(n => attendance[n] === 'yes')
  const yesCount     = attendees.filter(n => party[n] === 'yes').length
  const noCount      = attendees.filter(n => party[n] === 'no').length
  const pendingCount = attendees.filter(n => !party[n] || (party[n] !== 'yes' && party[n] !== 'no')).length

  const answered   = attendees.filter(n => party[n] === 'yes' || party[n] === 'no')
  const unanswered = attendees.filter(n => !party[n] || (party[n] !== 'yes' && party[n] !== 'no'))
  const allDone    = unanswered.length === 0 && attendees.length > 0

  const isAdmin  = role === 'admin' || role === 'owner'
  const isGuest  = role === 'guest'

  // 非ゲストは全員分回答可、名前登録済みゲストは自分の行のみ回答可
  const canAnswerRow = (rowName: string) =>
    !isGuest || (!!authUserName && rowName === authUserName)

  const BtnPair = ({ name }: { name: string }) => {
    if (!canAnswerRow(name)) return null
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {(['yes', 'no'] as PartyStatus[]).map(val => {
          const isSelected = party[name] === val
          const color = val === 'yes' ? 'var(--accent)' : 'var(--red)'
          const bg    = val === 'yes' ? 'rgba(110,231,183,0.2)' : 'rgba(248,113,113,0.15)'
          return (
            <button key={val} onClick={() => onSetParty(name, isSelected ? '' : val)}
              style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif", border: `1.5px solid ${isSelected ? color : 'rgba(255,255,255,0.2)'}`, background: isSelected ? bg : 'var(--surface2)', color: isSelected ? color : 'var(--text-muted)' }}>
              {val === 'yes' ? '参加' : '不参加'}
            </button>
          )
        })}
      </div>
    )
  }

  const RowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '8px 4px', gap: 6 }

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent)' }}>{yesCount}</div><div className="stat-label">参加</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--red)' }}>{noCount}</div><div className="stat-label">不参加</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--text-muted)' }}>{pendingCount}</div><div className="stat-label">未回答</div></div>
      </div>

      {isGuest && !authUserName && (
        <div className="card">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            ホームで名前を登録すると懇親会の回答ができます
          </p>
        </div>
      )}

      <div className="card" style={{ paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="card-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>懇親会参加確認</div>
          <button className="btn btn-sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? '未回答のみ表示' : '回答済みを表示'}
          </button>
        </div>

        {!attendees.length ? (
          <div className="empty">出欠タブで参加者を登録してください</div>
        ) : allDone && !showAll ? (
          <div>
            <div style={{ textAlign: 'center', padding: '14px', color: 'var(--accent)', fontWeight: 700, marginBottom: 12 }}>🎉 全員回答完了！</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 6 }}>参加 {yesCount}人</div>
              <div style={{ fontSize: 14, lineHeight: 2 }}>{attendees.filter(n => party[n] === 'yes').map(d).join('　') || '—'}</div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', letterSpacing: '0.06em', marginBottom: 6 }}>不参加 {noCount}人</div>
              <div style={{ fontSize: 14, lineHeight: 2 }}>{attendees.filter(n => party[n] === 'no').map(d).join('　') || '—'}</div>
            </div>
            {isAdmin && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 4 }}>
                <button className="btn btn-sm btn-danger" style={{ width: '100%' }}
                  onClick={() => confirm('懇親会の回答をリセットしますか？') && onResetParty()}>
                  回答をリセット
                </button>
              </div>
            )}
          </div>
        ) : (
          <table className="member-table">
            <thead><tr><th>{showAll ? '回答済み' : '未回答'}</th><th>参加</th></tr></thead>
            <tbody>
              {(showAll ? answered : unanswered).map(name => (
                <tr key={name} style={RowStyle as React.CSSProperties}>
                  <td style={{ fontWeight: 500, fontSize: 13, flex: 1, border: 'none', padding: 0 }}>{d(name)}</td>
                  <td style={{ border: 'none', padding: 0, flexShrink: 0 }}><BtnPair name={name} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
