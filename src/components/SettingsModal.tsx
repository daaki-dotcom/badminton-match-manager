import { useState } from 'react'
import { ref, get, update } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { hashPassword } from '../auth'
import { AuthUser } from '../types'

interface Props {
  authUser: AuthUser
  onClose: () => void
  onNameChange: (newName: string) => void
}

export function SettingsModal({ authUser, onClose, onNameChange }: Props) {
  const [tab, setTab]             = useState<'name' | 'password'>('name')

  // 名前変更
  const [nameVal, setNameVal]     = useState(authUser.name)
  const [nameError, setNameError] = useState('')
  const [nameDone, setNameDone]   = useState(false)

  // PW変更
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [pwError, setPwError]       = useState('')
  const [pwDone, setPwDone]         = useState(false)
  const [loading, setLoading]       = useState(false)

  const handleSaveName = async () => {
    const trimmed = nameVal.trim()
    if (!trimmed) { setNameError('名前を入力してください'); return }
    setLoading(true)
    await update(ref(db, `${ROOT}/users/${authUser.userId}`), { name: trimmed })
    onNameChange(trimmed)
    setLoading(false)
    setNameError('')
    setNameDone(true)
  }

  const handleSavePassword = async () => {
    setPwError('')
    if (!currentPw) { setPwError('現在のパスワードを入力してください'); return }
    if (newPw.length < 6) { setPwError('新しいパスワードは6文字以上で設定してください'); return }
    if (newPw !== confirmPw) { setPwError('パスワードが一致しません'); return }

    setLoading(true)

    // 現在のパスワードを照合する
    const snap = await get(ref(db, `${ROOT}/users/${authUser.userId}`))
    if (!snap.exists()) { setPwError('ユーザー情報が取得できません'); setLoading(false); return }

    const currentHash = await hashPassword(currentPw)
    const record = snap.val()
    if (record.passwordHash !== currentHash) {
      setPwError('現在のパスワードが正しくありません')
      setLoading(false)
      return
    }

    const newHash = await hashPassword(newPw)
    await update(ref(db, `${ROOT}/users/${authUser.userId}`), { passwordHash: newHash })
    setLoading(false)
    setPwDone(true)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: 360 }}>
        <div className="modal-title">⚙️ 設定</div>

        {/* タブ切り替え */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1rem', background: 'var(--surface2)', borderRadius: 8, padding: 4 }}>
          {(['name', 'password'] as const).map(t => (
            <button key={t}
              onClick={() => { setTab(t); setNameDone(false); setPwDone(false) }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif",
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
              {t === 'name' ? '名前変更' : 'PW変更'}
            </button>
          ))}
        </div>

        {tab === 'name' && (
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              新しい名前
            </label>
            <input type="text" value={nameVal} onChange={e => { setNameVal(e.target.value); setNameDone(false) }}
              style={{ width: '100%', marginBottom: '0.75rem' }} />
            {nameError && <p className="modal-error">{nameError}</p>}
            {nameDone && <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: '0.5rem' }}>✅ 名前を変更しました</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={onClose}>閉じる</button>
              <button className="btn btn-accent" style={{ flex: 1 }} onClick={handleSaveName} disabled={loading}>
                {loading ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        )}

        {tab === 'password' && (
          <div>
            {pwDone ? (
              <div>
                <p style={{ fontSize: 14, color: 'var(--accent)', textAlign: 'center', padding: '1rem 0' }}>
                  ✅ パスワードを変更しました
                </p>
                <button className="btn btn-accent" style={{ width: '100%' }} onClick={onClose}>閉じる</button>
              </div>
            ) : (
              <>
                {[
                  { label: '現在のパスワード', val: currentPw, set: setCurrentPw },
                  { label: '新しいパスワード（6文字以上）', val: newPw, set: setNewPw },
                  { label: '確認用パスワード', val: confirmPw, set: setConfirmPw },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      {f.label}
                    </label>
                    <input type="password" value={f.val} onChange={e => { f.set(e.target.value); setPwDone(false) }}
                      style={{ width: '100%' }} autoComplete="new-password" />
                  </div>
                ))}
                {pwError && <p className="modal-error">{pwError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={onClose}>キャンセル</button>
                  <button className="btn btn-accent" style={{ flex: 1 }} onClick={handleSavePassword} disabled={loading}>
                    {loading ? '変更中...' : '変更する'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
