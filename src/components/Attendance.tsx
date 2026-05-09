import { useState } from 'react'
import { AttendanceStatus, UserRole } from '../types'

interface Props {
  attendance: Record<string, AttendanceStatus>
  activityDate: string
  role: UserRole
  onSubmit: (name: string, val: AttendanceStatus) => void
  onRemove: (name: string) => void
  onReset: () => void
  onSetActivityDate: (date: string) => void
}

export function Attendance({ attendance, activityDate, role, onSubmit, onRemove, onReset, onSetActivityDate }: Props) {
  const [nameInput, setNameInput]   = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [modalDate, setModalDate]   = useState('')
  const [modalError, setModalError] = useState('')
  const [showList, setShowList]     = useState(false)

  const yesList    = Object.keys(attendance).filter(n => attendance[n] === 'yes')
  const noList     = Object.keys(attendance).filter(n => attendance[n] === 'no')
  const undList    = Object.keys(attendance).filter(n => attendance[n] === 'undecided')
  const allAnswered = Object.keys(attendance).filter(n => attendance[n])

  const labelMap: Record<string, string> = { yes: '参加', no: '不参加', undecided: '未定' }
  const colorMap: Record<string, string> = { yes: 'var(--accent)', no: 'var(--red)', undecided: 'var(--accent3)' }

  const isAdmin  = role === 'admin'
  const isMember = role === 'member'

  const handleSubmit = (val: AttendanceStatus) => {
    const name = nameInput.trim()
    if (!name) return
    onSubmit(name, val)
    setNameInput('')
  }

  const handleOpenModal = () => {
    setModalDate(activityDate || '')
    setModalError('')
    setShowModal(true)
  }

  const handleConfirmModal = () => {
    if (!modalDate) { setModalError('活動日を選択してください'); return }
    onSetActivityDate(modalDate)
    setShowModal(false)
  }

  const getDeadline = () => {
    if (!activityDate) return ''
    const d = new Date(activityDate)
    d.setDate(d.getDate() + 7)
    return d.toLocaleDateString('ja-JP')
  }

  return (
    <div>
      {/* 活動日設定モーダル（admin のみ表示） */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-card">
            <div className="modal-title">📅 活動日の設定</div>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>活動日</label>
              <input type="date" value={modalDate} onChange={e => setModalDate(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmModal()}
                style={{ width: '100%' }} />
            </div>
            <div className="modal-error">{modalError}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowModal(false)}>キャンセル</button>
              <button className="btn btn-accent" style={{ flex: 1 }} onClick={handleConfirmModal}>設定</button>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent)' }}>{yesList.length}</div><div className="stat-label">参加</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--red)' }}>{noList.length}</div><div className="stat-label">不参加</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent3)' }}>{undList.length}</div><div className="stat-label">未定</div></div>
      </div>

      {/* 活動日表示・設定（admin のみ変更ボタンを表示） */}
      <div className="card">
        <div className="card-title">活動日</div>
        <div style={{ fontSize: 13, color: activityDate ? 'var(--accent)' : 'var(--text-muted)', marginBottom: isAdmin ? '0.75rem' : 0 }}>
          {activityDate
            ? `活動日: ${activityDate}　リセット予定: ${getDeadline()}`
            : '活動日が設定されていません'}
        </div>
        {isAdmin && (
          <button className="btn btn-accent" style={{ width: '100%' }} onClick={handleOpenModal}>
            活動日を変更する
          </button>
        )}
      </div>

      {/* 出欠入力（guest は不可） */}
      {(isAdmin || isMember) && (
        <div className="card">
          <div className="card-title">出欠入力</div>
          <div className="input-row">
            <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit('yes')}
              placeholder="名前を入力" />
          </div>
          <div className="fmt-group" style={{ marginBottom: 0 }}>
            <button className="fmt-btn" onClick={() => handleSubmit('yes')} style={{ color: 'var(--accent)', borderColor: 'rgba(110,231,183,0.4)' }}>参加</button>
            <button className="fmt-btn" onClick={() => handleSubmit('no')} style={{ color: 'var(--red)', borderColor: 'rgba(248,113,113,0.4)' }}>不参加</button>
            <button className="fmt-btn" onClick={() => handleSubmit('undecided')} style={{ color: 'var(--accent3)', borderColor: 'rgba(251,191,36,0.4)' }}>未定</button>
          </div>
        </div>
      )}

      {/* 参加者一覧（折りたたみ・コピー） */}
      {yesList.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div className="card-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
              参加メンバー一覧（{yesList.length}人）
            </div>
            <button className="btn btn-sm" onClick={() => setShowList(v => !v)}>
              {showList ? '▲ 非表示' : '▼ 表示'}
            </button>
          </div>
          {showList && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.75rem', marginBottom: '0.75rem' }}>
              {yesList.map(name => (
                <div key={name} style={{ fontSize: 14, lineHeight: 2 }}>{name}</div>
              ))}
            </div>
          )}
          <button className="btn btn-accent" style={{ width: '100%' }}
            onClick={() => navigator.clipboard.writeText(yesList.join('\n'))}>
            一覧をコピー
          </button>
        </div>
      )}

      {/* 回答一覧（admin は削除ボタンあり） */}
      <div className="card">
        <div className="card-title">回答一覧</div>
        {allAnswered.length === 0 ? (
          <div className="empty" style={{ padding: '1rem 0' }}>まだ回答がありません</div>
        ) : (
          <table className="member-table">
            <thead><tr><th>名前</th><th>回答</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {allAnswered.map(name => (
                <tr key={name}>
                  <td style={{ fontWeight: 500 }}>{name}</td>
                  <td><span style={{ fontSize: 12, fontWeight: 700, color: colorMap[attendance[name]] }}>{labelMap[attendance[name]]}</span></td>
                  {isAdmin && (
                    <td><button className="btn btn-sm btn-danger" onClick={() => onRemove(name)}>削除</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* リセット（admin のみ） */}
      {isAdmin && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          <button className="btn btn-sm btn-danger"
            onClick={() => confirm('出欠情報をリセットしますか？') && onReset()}>
            出欠をリセット
          </button>
        </div>
      )}
    </div>
  )
}
