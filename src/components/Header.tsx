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

      {/* 1行目：ロゴ＋アプリ名 */}
      <div className="header-row1">
        <div className="logo-icon">🏸</div>
        <span className="header-title">バドミントン試合管理</span>
      </div>

      {/* 2行目：同期状態（左）＋統計＋ボタン（右） */}
      <div className="header-row2">
        <div className="sync-status">
          <div className={`sync-dot ${connected ? 'connected' : ''}`} />
          <span className="sync-label">
            {syncing ? '同期中...' : connected ? 'リアルタイム同期中' : '切断中'}
          </span>
        </div>

        <div className="header-row2-right">
          <div className="header-stats">
            <div className="hstat"><div className="hstat-num">{attendCount}</div>参加</div>
            <div className="hstat"><div className="hstat-num">{matchCount}</div>試合</div>
            <div className="hstat"><div className="hstat-num">{doneCount}</div>終了</div>
          </div>
          {role !== 'guest' && (
            <button className="header-btn-icon" onClick={onOpenSettings} title="設定">⚙️</button>
          )}
          <button className="header-btn-logout" onClick={onLogout}>ログアウト</button>
        </div>
      </div>

    </header>
  )
}
