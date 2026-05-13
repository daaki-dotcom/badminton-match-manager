import { useState } from 'react'
import { ref, set } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { hashPassword } from '../auth'
import { GuestUserRecord } from '../types'

interface Props {
  guestId: string
  name: string
  onComplete: () => void  // 設定完了 → ログアウトしてログイン画面へ
}

export function GuestPasswordSetup({ guestId, name, onComplete }: Props) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [copied, setCopied]       = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 4) { setError('パスワードは4文字以上で設定してください'); return }
    if (password !== confirm)  { setError('パスワードが一致しません'); return }

    setLoading(true)
    const hash = await hashPassword(password)
    await set(ref(db, `${ROOT}/guestUsers/${guestId}`), {
      passwordHash: hash,
      name,
    } satisfies GuestUserRecord)
    // 参加者一覧に表示されるよう出欠を「参加」で初期化する
    await set(ref(db, `${ROOT}/attendance/${name}`), 'yes')
    setLoading(false)
    onComplete()
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">🔑 パスワード設定</h1>
        <p className="login-notice">
          ゲストIDが発行されました。<br />
          パスワードを設定してログインしてください。
        </p>

        <div className="admin-issued" style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>あなたのゲストID</p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em' }}>
            {guestId}
          </p>
          <button className="btn-copy" style={{ marginTop: 8 }} onClick={() => {
            navigator.clipboard.writeText(guestId)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}>
            {copied ? 'コピーしました！' : 'IDをコピーする'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8, lineHeight: 1.6 }}>
            ⚠️ このIDは再表示できません。必ず控えてください。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            パスワード（4文字以上）
            <input className="login-input" type="password" value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="パスワードを設定" autoComplete="new-password" />
          </label>
          <label className="login-label">
            確認用パスワード
            <input className="login-input" type="password" value={confirm}
              onChange={e => { setConfirm(e.target.value); setError('') }}
              placeholder="もう一度入力" autoComplete="new-password" />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="login-btn-primary" type="submit" disabled={loading}>
            {loading ? '設定中...' : '設定する（ログイン画面へ）'}
          </button>
        </form>
      </div>
    </div>
  )
}
