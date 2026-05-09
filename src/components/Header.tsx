import { Match, AttendanceStatus, UserRole } from '../types'

interface Props {
  attendance: Record<string, AttendanceStatus>
  matches: Match[]
  connected: boolean
  syncing: boolean
  role: UserRole
  onLogout: () => void
  onOpenSettings: () => void
}

export function Header({ attendance, matches, connected, syncing, role, onLogout, onOpenSettings }: Props) {
  const attendCount = Object.values(attendance).filter(v => v === 'yes').length
  const matchCount  = matches.length
  const doneCount   = matches.filter(m => m.status === 'done').length

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-icon">🏸</div>
        <div style={{ lineHeight: 1.3 }}>バドミントン<br />試合管理</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div className="sync-status">
          <div className={`sync-dot ${connected ? 'connected' : ''}`} />
          <span style={{ whiteSpace: 'nowrap' }}>
            {syncing ? '同期中...' : connected ? 'リアルタイム同期中' : '切断中'}
          </span>
        </div>
        <div className="header-stats">
          <div className="hstat"><div className="hstat-num">{attendCount}</div>参加</div>
          <div className="hstat"><div className="hstat-num">{matchCount}</div>試合</div>
          <div className="hstat"><div className="hstat-num">{doneCount}</div>終了</div>
        </div>
        {/* guest 以外はログアウトボタンを表示 */}
        {role !== 'guest' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={onOpenSettings} title="設定">⚙️</button>
            <button className="btn btn-sm" onClick={onLogout} style={{ whiteSpace: 'nowrap' }}>
              ログアウト
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
