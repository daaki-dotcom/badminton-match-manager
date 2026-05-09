import { useState } from 'react'
import { ref, update } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { hashPassword, saveSession } from '../auth'
import { AuthUser } from '../types'

interface Props {
  user: AuthUser
  onComplete: (user: AuthUser) => void
}

export function PasswordChange({ user, onComplete }: Props) {
  const [newPw, setNewPw]       = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPw.length < 6) {
      setError('パスワードは6文字以上で設定してください')
      return
    }
    if (newPw !== confirmPw) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    const hash = await hashPassword(newPw)

    await update(ref(db, `${ROOT}/users/${user.userId}`), {
      passwordHash: hash,
      isFirstLogin: false,
    })

    saveSession(user.userId, user.role, user.name)

    setLoading(false)
    onComplete({ ...user, isFirstLogin: false })
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">🏸 パスワードを変更してください</h1>
        <p className="login-notice">
          初回ログインのため、パスワードの変更が必要です。
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            新しいパスワード
            <input
              className="login-input"
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="6文字以上"
              autoComplete="new-password"
            />
          </label>

          <label className="login-label">
            確認用パスワード
            <input
              className="login-input"
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="もう一度入力"
              autoComplete="new-password"
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button className="login-btn-primary" type="submit" disabled={loading}>
            {loading ? '変更中...' : '変更する'}
          </button>
        </form>
      </div>
    </div>
  )
}
