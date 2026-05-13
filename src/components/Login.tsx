import { useState, useEffect } from 'react'
import { ref, get, set } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { loginWithId, loginAsGuest, hashPassword, loadGuestSession } from '../auth'
import { AuthUser, UserRecord } from '../types'

interface Props {
  onLogin: (user: AuthUser) => void
}

function generateRandomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function Login({ onLogin }: Props) {
  const [userId, setUserId]       = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [checking, setChecking]   = useState(true)

  // 初回セットアップ用
  const [isSetup, setIsSetup]       = useState(false)
  const [setupPw, setSetupPw]       = useState('')
  const [setupPwConfirm, setSetupPwConfirm] = useState('')
  const [setupError, setSetupError] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)
  const [issuedId, setIssuedId]     = useState('')

  // Firebase に users ノードが存在するか確認する
  useEffect(() => {
    const checkUsers = async () => {
      const snap = await get(ref(db, `${ROOT}/users`))
      if (!snap.exists() || Object.keys(snap.val() ?? {}).length === 0) {
        setIsSetup(true)
      }
      setChecking(false)
    }
    checkUsers()
  }, [])

  // 初回セットアップ：最初の admin アカウントを作成する
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setSetupError('')
    if (setupPw.length < 6) { setSetupError('パスワードは6文字以上で設定してください'); return }
    if (setupPw !== setupPwConfirm) { setSetupError('パスワードが一致しません'); return }

    setSetupLoading(true)
    const id   = generateRandomId()
    const hash = await hashPassword(setupPw)
    await set(ref(db, `${ROOT}/users/${id}`), {
      passwordHash: hash,
      role: 'admin',
      isFirstLogin: false,
      name: '管理者',
    } satisfies UserRecord)

    setIssuedId(id)
    setSetupLoading(false)
  }

  const handleSetupComplete = () => {
    setIsSetup(false)
    setUserId(issuedId)
  }

  // 通常ログイン
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId.trim() || !password.trim()) { setError('IDとパスワードを入力してください'); return }

    setLoading(true)
    setError('')
    const user = await loginWithId(userId.trim(), password)
    setLoading(false)

    if (!user) { setError('IDまたはパスワードが正しくありません'); return }
    onLogin(user)
  }

  if (checking) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <div className="loading-text">接続中...</div>
      </div>
    )
  }

  // 初回セットアップ画面
  if (isSetup) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1 className="login-title">🏸 初回セットアップ</h1>
          <p className="login-notice">
            管理者（admin）アカウントを作成します。<br />
            このIDとパスワードでログインしてください。
          </p>

          {issuedId ? (
            <div>
              <div className="admin-issued">
                <p className="admin-issued-text">
                  あなたのID: <strong style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{issuedId}</strong>
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
                  このIDは再表示できません。必ず控えてください。
                </p>
              </div>
              <button className="login-btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={handleSetupComplete}>
                ログイン画面へ
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetup} className="login-form">
              <label className="login-label">
                パスワード（6文字以上）
                <input className="login-input" type="password" value={setupPw}
                  onChange={e => setSetupPw(e.target.value)} placeholder="パスワードを設定" autoComplete="new-password" />
              </label>
              <label className="login-label">
                確認用パスワード
                <input className="login-input" type="password" value={setupPwConfirm}
                  onChange={e => setSetupPwConfirm(e.target.value)} placeholder="もう一度入力" autoComplete="new-password" />
              </label>
              {setupError && <p className="login-error">{setupError}</p>}
              <button className="login-btn-primary" type="submit" disabled={setupLoading}>
                {setupLoading ? '作成中...' : '管理者アカウントを作成'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // 通常ログイン画面
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">🏸 バドミントン試合管理</h1>

        <p className="login-notice">
          このアプリは部内の活動管理のみを目的としています。<br />
          収集する情報は名前・出欠・試合結果のみです。
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            ID
            <input className="login-input" type="text" value={userId}
              onChange={e => setUserId(e.target.value)} placeholder="発行されたIDを入力"
              autoComplete="username" />
          </label>

          <label className="login-label">
            パスワード
            <input className="login-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="パスワードを入力"
              autoComplete="current-password" />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button className="login-btn-primary" type="submit" disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="login-divider">または</div>

        <button className="login-btn-guest" type="button" onClick={() => {
          const existing = loadGuestSession()
          if (existing) {
            onLogin({ userId: 'guest', role: 'guest', name: existing.name, isFirstLogin: false })
          } else {
            onLogin(loginAsGuest())
          }
        }}>
          ゲストとして入場する
        </button>

        <p className="login-guest-note">ゲストは閲覧と懇親会回答のみ可能です</p>
      </div>
    </div>
  )
}
