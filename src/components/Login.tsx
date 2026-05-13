import { useState, useEffect } from 'react'
import { ref, get, set } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { loginWithId, loginAsGuest, hashPassword, loadGuestSession, restoreGuestSession } from '../auth'
import { AuthUser, UserRecord, GuestRecord } from '../types'

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

  // ゲストID再入場用
  const [guestIdInput, setGuestIdInput]     = useState('')
  const [guestIdError, setGuestIdError]     = useState('')
  const [guestIdLoading, setGuestIdLoading] = useState(false)

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

  // ゲストIDで再入場する
  const handleGuestRelogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = guestIdInput.trim()
    if (!id) { setGuestIdError('ゲストIDを入力してください'); return }

    setGuestIdLoading(true)
    setGuestIdError('')
    const snap = await get(ref(db, `${ROOT}/guests/${id}`))
    if (!snap.exists()) {
      setGuestIdError('このゲストIDは存在しないか、期限切れです')
      setGuestIdLoading(false)
      return
    }
    const record = snap.val() as GuestRecord
    if (Date.now() > record.expiry) {
      setGuestIdError('このゲストIDは期限切れです')
      setGuestIdLoading(false)
      return
    }
    restoreGuestSession(id, record.name, record.expiry)
    setGuestIdLoading(false)
    onLogin({ userId: id, role: 'guest', name: record.name, isFirstLogin: false })
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
            onLogin({ userId: existing.guestId, role: 'guest', name: existing.name, isFirstLogin: false })
          } else {
            onLogin(loginAsGuest())
          }
        }}>
          ゲストとして入場する
        </button>

        <p className="login-guest-note">ゲストは閲覧と懇親会回答のみ可能です</p>

        <div className="login-divider">ゲストIDをお持ちの方</div>

        <form onSubmit={handleGuestRelogin} className="login-form" style={{ marginTop: 0 }}>
          <label className="login-label">
            ゲストID
            <input className="login-input" type="text" value={guestIdInput}
              onChange={e => { setGuestIdInput(e.target.value); setGuestIdError('') }}
              placeholder="例：g_abc123" autoComplete="off" />
          </label>
          {guestIdError && <p className="login-error">{guestIdError}</p>}
          <button className="login-btn-guest" type="submit" disabled={guestIdLoading}>
            {guestIdLoading ? '確認中...' : 'ゲストIDで再入場する'}
          </button>
        </form>
      </div>
    </div>
  )
}
