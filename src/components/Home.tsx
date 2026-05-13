import { useState } from 'react'
import { AuthUser, AppState, AttendanceStatus } from '../types'

interface Props {
  authUser: AuthUser
  state: AppState
  isManagementOnly: boolean
  isActivityEnded: boolean
  onSubmitAttendance: (name: string, val: AttendanceStatus) => void
  onGuestRegister?: (name: string) => void
  onNavigate: (tab: string) => void
}

export function Home({ authUser, state, isManagementOnly, isActivityEnded, onSubmitAttendance, onGuestRegister, onNavigate }: Props) {
  const { attendance, activityDate, matches, memberLevels } = state
  const { name, role } = authUser

  const isGuest    = role === 'guest'
  const isAdmin    = role === 'admin'
  const guestNamed = isGuest && !!name

  const [guestInput, setGuestInput] = useState('')
  const [guestError, setGuestError] = useState('')

  // 出欠統計
  const yesList = Object.keys(attendance).filter(n => attendance[n] === 'yes')
  const noList  = Object.keys(attendance).filter(n => attendance[n] === 'no')
  const undList = Object.keys(attendance).filter(n => attendance[n] === 'undecided')

  // 自分の出欠状況（管理専用・名前未登録ゲスト以外）
  const myStatus = (isManagementOnly || (isGuest && !name)) ? null : attendance[name]
  const statusLabel: Record<string, string> = { yes: '✅ 参加', no: '❌ 不参加', undecided: '🕐 未定', '': '未回答' }
  const statusColor: Record<string, string> = { yes: 'var(--accent)', no: 'var(--red)', undecided: 'var(--accent3)', '': 'var(--text-muted)' }

  // 試合進捗
  const doneCount  = matches.filter(m => m.status === 'done').length
  const totalCount = matches.length
  const pct        = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0

  // 経験者・未経験者数
  const expCount = yesList.filter(n => memberLevels[n] === 'exp').length
  const novCount = yesList.length - expCount

  // リセット予定日
  const getDeadline = () => {
    if (!activityDate) return null
    const d = new Date(activityDate)
    d.setDate(d.getDate() + 7)
    return d.toLocaleDateString('ja-JP')
  }

  const handleAttendance = (val: AttendanceStatus) => {
    onSubmitAttendance(name, val)
  }

  return (
    <div className="home">
      {/* 活動終了バナー */}
      {isActivityEnded && (
        <div className="card" style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>🔒 活動は終了しました</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>データの編集はできません（閲覧のみ）</div>
        </div>
      )}

      {/* ゲスト名前登録フォーム（名前未登録 かつ 活動中のみ表示） */}
      {isGuest && !name && !isActivityEnded && (
        <div className="card">
          <div className="card-title">👤 ゲスト登録</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
            名前を入力してください。登録後にIDとパスワードを設定します。
          </p>
          <label className="login-label" style={{ marginBottom: '0.75rem' }}>
            名前
            <input
              className="login-input"
              type="text"
              value={guestInput}
              onChange={e => { setGuestInput(e.target.value); setGuestError('') }}
              placeholder="例：田中 太郎"
              maxLength={20}
            />
          </label>
          {guestError && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{guestError}</p>}
          <button
            className="btn btn-accent"
            style={{ marginTop: '1rem', width: '100%' }}
            onClick={() => {
              if (!guestInput.trim()) { setGuestError('名前を入力してください'); return }
              onGuestRegister?.(guestInput.trim())
            }}
          >
            登録する
          </button>
        </div>
      )}

      {/* ウェルカムカード */}
      <div className="home-welcome">
        <div className="home-greeting">
          {name
            ? <><span className="home-name">{name}</span> さん、こんにちは！</>
            : <>ゲストとして入場中</>
          }
        </div>
        <span className={`role-badge role-${role === 'guest' ? 'guest' : role}`}>
          {role}
        </span>
      </div>

      {/* 活動日 */}
      <div className="card">
        <div className="card-title">📅 活動日</div>
        {activityDate ? (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
              {activityDate}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              ゲストデータ自動削除: {getDeadline()}
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>活動日が設定されていません</div>
        )}
        {isAdmin && !activityDate && (
          <button className="btn btn-accent" style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={() => onNavigate('admin')}>
            活動日を設定する
          </button>
        )}
      </div>

      {/* 自分の出欠（管理専用・名前未登録ゲスト・活動終了時は非表示） */}
      {!isManagementOnly && (!isGuest || guestNamed) && !isActivityEnded && (
        <div className="card">
          <div className="card-title">📋 あなたの出欠</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: statusColor[myStatus ?? ''] }}>
              {statusLabel[myStatus ?? '']}
            </span>
          </div>
          <div className="fmt-group" style={{ marginBottom: 0 }}>
            <button className={`fmt-btn ${myStatus === 'yes' ? 'selected' : ''}`}
              style={{ color: 'var(--accent)', borderColor: 'rgba(110,231,183,0.4)' }}
              onClick={() => handleAttendance('yes')}>
              参加
            </button>
            <button className={`fmt-btn ${myStatus === 'no' ? 'selected' : ''}`}
              style={{ color: 'var(--red)', borderColor: 'rgba(248,113,113,0.4)' }}
              onClick={() => handleAttendance('no')}>
              不参加
            </button>
            <button className={`fmt-btn ${myStatus === 'undecided' ? 'selected' : ''}`}
              style={{ color: 'var(--accent3)', borderColor: 'rgba(251,191,36,0.4)' }}
              onClick={() => handleAttendance('undecided')}>
              未定
            </button>
          </div>
        </div>
      )}

      {/* 今日の参加状況 */}
      <div className="card">
        <div className="card-title">👥 今日の参加状況</div>
        <div className="stats-grid" style={{ marginBottom: 0 }}>
          <div className="stat-card">
            <div className="stat-num" style={{ color: 'var(--accent)' }}>{yesList.length}</div>
            <div className="stat-label">参加</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: 'var(--red)' }}>{noList.length}</div>
            <div className="stat-label">不参加</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: 'var(--accent3)' }}>{undList.length}</div>
            <div className="stat-label">未定</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: 'var(--accent)' }}>{expCount}</div>
            <div className="stat-label">経験者</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: 'var(--blue)' }}>{novCount}</div>
            <div className="stat-label">未経験者</div>
          </div>
        </div>
      </div>

      {/* 試合進捗 */}
      {totalCount > 0 && (
        <div className="card">
          <div className="card-title">🎯 試合進捗</div>
          <div className="progress-wrap">
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="progress-label">
              <span>{doneCount} / {totalCount} 試合終了</span>
              <span>{pct}%</span>
            </div>
          </div>
          <button className="btn" style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={() => onNavigate('results')}>
            結果・順位を見る
          </button>
        </div>
      )}

      {/* クイックナビ */}
      <div className="home-nav-grid">
        <button className="home-nav-btn" onClick={() => onNavigate('members')}>
          <span className="home-nav-icon">👥</span>
          <span>メンバー</span>
        </button>
        <button className="home-nav-btn" onClick={() => onNavigate('matches')}>
          <span className="home-nav-icon">🎯</span>
          <span>組み合わせ</span>
        </button>
        <button className="home-nav-btn" onClick={() => onNavigate('results')}>
          <span className="home-nav-icon">🏆</span>
          <span>結果・順位</span>
        </button>
        <button className="home-nav-btn" onClick={() => onNavigate('party')}>
          <span className="home-nav-icon">🍻</span>
          <span>懇親会</span>
        </button>
      </div>
    </div>
  )
}
