import { useState } from 'react'
import { AttendanceStatus, MemberLevel, UserRole } from '../types'

interface Props {
  attendance:           Record<string, AttendanceStatus>
  memberLevels:         Record<string, MemberLevel>
  dbLevels:             Record<string, MemberLevel>
  memberNames:          string[]
  managementOnlyNames:  string[]
  courts:               number
  role:                 UserRole
  maskMap:              Record<string, string>
  paymentClub:          Record<string, boolean>
  paymentParty:         Record<string, boolean>
  onToggleLevel:        (name: string) => void
  onTogglePaymentClub:  (name: string) => void
  onTogglePaymentParty: (name: string) => void
}

export function Members({
  attendance, memberLevels, dbLevels, memberNames, managementOnlyNames, courts, role,
  maskMap, paymentClub, paymentParty,
  onToggleLevel, onTogglePaymentClub, onTogglePaymentParty,
}: Props) {
  const masked = Object.keys(maskMap).length > 0
  const d = (name: string) => maskMap[name] ?? name
  const [showList, setShowList] = useState(false)

  const mgmtSet = new Set(managementOnlyNames)
  // 管理専用ユーザーはすべての一覧から除外する
  const attendees = Object.keys(attendance).filter(n => attendance[n] === 'yes'  && !mgmtSet.has(n))
  const noList    = Object.keys(attendance).filter(n => attendance[n] === 'no'   && !mgmtSet.has(n))
  const undList   = Object.keys(attendance).filter(n => attendance[n] === 'undecided' && !mgmtSet.has(n))

  const memberNameSet = new Set(memberNames)
  const isMember      = (name: string) => memberNameSet.has(name)
  // 正規部員はDBレベル優先、ゲストはセッション別レベル
  const getLevel      = (name: string): MemberLevel =>
    isMember(name) ? (dbLevels[name] ?? 'nov') : (memberLevels[name] ?? 'nov')

  const expCount = attendees.filter(n => getLevel(n) === 'exp').length
  const novCount = attendees.length - expCount
  const isAdmin  = role === 'admin' || role === 'owner'

  const MemberBadge = ({ name }: { name: string }) => (
    <span className={`type-badge ${isMember(name) ? 'type-member' : 'type-guest'}`}>
      {isMember(name) ? '正規' : 'ゲスト'}
    </span>
  )

  const LevelBadge = ({ name }: { name: string }) => {
    const isExp = getLevel(name) === 'exp'
    // 正規部員はDBレベル（静的表示）、ゲストはトグル操作可能
    if (isMember(name)) {
      return (
        <span className={isExp ? 'badge-exp' : 'badge-nov'}>
          {isExp ? '経験者' : '未経験者'}
        </span>
      )
    }
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: isAdmin ? 'pointer' : 'default' }}
        onClick={() => isAdmin && onToggleLevel(name)}>
        <div className={`toggle-switch ${isExp ? 'on' : ''}`}>
          <div className="toggle-knob" />
        </div>
        <span style={{ fontSize: 12, color: isExp ? 'var(--accent)' : 'var(--blue)' }}>
          {isExp ? '経験者' : '未経験者'}
        </span>
      </div>
    )
  }

  const PayCell = ({ paid, onToggle }: { name: string; paid: boolean; onToggle: () => void }) => (
    <button
      onClick={() => isAdmin && onToggle()}
      style={{
        padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
        border: `1.5px solid ${paid ? 'rgba(110,231,183,0.4)' : 'rgba(255,255,255,0.15)'}`,
        background: paid ? 'rgba(110,231,183,0.15)' : 'var(--surface2)',
        color: paid ? 'var(--accent)' : 'var(--text-muted)',
        cursor: isAdmin ? 'pointer' : 'default',
        fontFamily: "'Noto Sans JP', sans-serif",
      }}>
      {paid ? '✅ 済' : '未払い'}
    </button>
  )

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num">{attendees.length}</div><div className="stat-label">今日の参加者</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent)' }}>{expCount}</div><div className="stat-label">経験者</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--blue)' }}>{novCount}</div><div className="stat-label">未経験者</div></div>
        <div className="stat-card"><div className="stat-num">{courts}</div><div className="stat-label">コート数</div></div>
      </div>

      {/* 参加メンバー一覧（折りたたみ＋コピー） */}
      {attendees.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div className="card-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
              参加メンバー一覧（{attendees.length}人）
            </div>
            <button className="btn btn-sm" onClick={() => setShowList(v => !v)}>
              {showList ? '▲ 非表示' : '▼ 表示'}
            </button>
          </div>
          {showList && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
              {attendees.map(name => (
                <div key={name} style={{ fontSize: 14, lineHeight: 2 }}>{d(name)}</div>
              ))}
            </div>
          )}
          {!masked && (
            <button className="btn btn-accent" style={{ width: '100%' }}
              onClick={() => navigator.clipboard.writeText(attendees.join('\n'))}>
              一覧をコピー
            </button>
          )}
        </div>
      )}

      {/* 出欠一覧（不参加・未定のみ表示） */}
      {(noList.length > 0 || undList.length > 0) && (
        <div className="card">
          <div className="card-title">出欠一覧</div>
          <table className="member-table">
            <thead><tr><th>名前</th><th>区分</th><th>回答</th></tr></thead>
            <tbody>
              {noList.map(name => (
                <tr key={name}>
                  <td style={{ fontWeight: 500 }}>{d(name)}</td>
                  <td><MemberBadge name={name} /></td>
                  <td><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>不参加</span></td>
                </tr>
              ))}
              {undList.map(name => (
                <tr key={name}>
                  <td style={{ fontWeight: 500 }}>{d(name)}</td>
                  <td><MemberBadge name={name} /></td>
                  <td><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>未定</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 参加者詳細（レベル・支払い管理） */}
      <div className="card">
        <div className="card-title">参加者詳細</div>
        {attendees.length === 0 ? (
          <div className="empty" style={{ padding: '1rem 0' }}>ホームで「参加」と回答したメンバーが表示されます</div>
        ) : (
          <table className="member-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>区分</th>
                <th>レベル</th>
                <th>部活費</th>
                <th>懇親会費</th>
              </tr>
            </thead>
            <tbody>
              {attendees.map(name => (
                <tr key={name}>
                  <td style={{ fontWeight: 500 }}>{d(name)}</td>
                  <td><MemberBadge name={name} /></td>
                  <td><LevelBadge name={name} /></td>
                  <td>
                    <PayCell
                      name={name}
                      paid={!!paymentClub[name]}
                      onToggle={() => onTogglePaymentClub(name)}
                    />
                  </td>
                  <td>
                    <PayCell
                      name={name}
                      paid={!!paymentParty[name]}
                      onToggle={() => onTogglePaymentParty(name)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
