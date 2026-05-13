import { useState, useEffect } from 'react'
import { ref, onValue } from 'firebase/database'
import { db, ROOT } from './firebase'
import { useFirebase } from './hooks/useFirebase'
import { loadSession, clearSession, saveSession, loadGuestSession, saveGuestSession, clearGuestSession } from './auth'
import { Header } from './components/Header'
import { Login } from './components/Login'
import { PasswordChange } from './components/PasswordChange'
import { Home } from './components/Home'
import { SettingsModal } from './components/SettingsModal'
import { Members } from './components/Members'
import { Matches } from './components/Matches'
import { Results } from './components/Results'
import { Party } from './components/Party'
import { Admin } from './components/Admin'
import { AuthUser, Match, AttendanceStatus, MemberLevel, PartyStatus, UserRecord } from './types'

type Tab = 'home' | 'members' | 'matches' | 'results' | 'party' | 'admin'

export default function App() {
  const [authUser, setAuthUser]         = useState<AuthUser | null>(null)
  const [authReady, setAuthReady]       = useState(false)
  const [activeTab, setActiveTab]       = useState<Tab>('home')
  const [showSettings, setShowSettings] = useState(false)
  // owner ロールを持つユーザーの名前一覧（試合プールから除外するために使用）
  const [managementOnlyNames, setManagementOnlyNames] = useState<string[]>([])  // 管理専用ユーザー名（出欠・試合・レベル対象外）
  const [memberNames, setMemberNames]     = useState<string[]>([])
  const [dbLevels, setDbLevels]           = useState<Record<string, MemberLevel>>({})  // DBのレベル

  const { state, setState, connected, loading, syncing, fbSet, fbUpdate } = useFirebase()

  // 起動時に localStorage のセッションを確認する
  useEffect(() => {
    const session = loadSession()
    if (session) {
      setAuthUser({ userId: session.userId, role: session.role, name: session.name ?? session.userId, isFirstLogin: false })
    } else {
      const guestSession = loadGuestSession()
      if (guestSession) {
        setAuthUser({ userId: 'guest', role: 'guest', name: guestSession.name, isFirstLogin: false })
      }
    }
    setAuthReady(true)
  }, [])

  // users ノードから owner 名・正規部員名・DB上のレベルをリアルタイム取得
  useEffect(() => {
    const unsub = onValue(ref(db, `${ROOT}/users`), snap => {
      if (!snap.exists()) {
        setManagementOnlyNames([])
        setMemberNames([])
        setDbLevels({})
        return
      }
      const data = snap.val() as Record<string, UserRecord>
      const records = Object.values(data)
      setManagementOnlyNames(records.filter(u => u.managementOnly).map(u => u.name))
      setMemberNames(records.filter(u => !u.managementOnly).map(u => u.name))
      setDbLevels(
        Object.fromEntries(
          records.filter(u => u.level).map(u => [u.name, u.level as MemberLevel])
        )
      )
    })
    return () => unsub()
  }, [])

  // Firebase 接続待ち または セッション確認前
  if (!authReady || loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <div className="loading-text">接続中...</div>
      </div>
    )
  }

  // 未ログイン → ログイン画面を表示
  if (!authUser) {
    return <Login onLogin={setAuthUser} />
  }

  // 初回ログイン → パスワード変更を強制
  if (authUser.isFirstLogin) {
    return <PasswordChange user={authUser} onComplete={setAuthUser} />
  }

  const role = authUser.role

  // 未登録ゲスト用 名前マスクマップ（名前 → "参加者A/B/..."）
  const isUnregisteredGuest = role === 'guest' && !authUser.name
  const maskMap: Record<string, string> = (() => {
    if (!isUnregisteredGuest) return {}
    const all = [...new Set([...memberNames, ...Object.keys(state.attendance)])].sort()
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    return Object.fromEntries(all.map((n, i) => [n, `参加者${labels[i] ?? String(i + 1)}`]))
  })()

  const tabs = [
    { id: 'home'    as Tab, label: '🏠 ホーム' },
    { id: 'members' as Tab, label: '👥 メンバー' },
    { id: 'matches'    as Tab, label: '🎯 組み合わせ' },
    { id: 'results'    as Tab, label: '🏆 結果' },
    { id: 'party'      as Tab, label: '🍻 懇親会' },
    ...((role === 'admin' || role === 'owner') ? [{ id: 'admin' as Tab, label: '⚙️ 管理' }] : []),
  ]

  // ── 出欠 ──
  const handleSubmitAttendance = (name: string, val: AttendanceStatus) => {
    const next = { ...state.attendance, [name]: state.attendance[name] === val ? '' : val }
    setState(s => ({ ...s, attendance: next }))
    fbSet('attendance', next)
  }

  // ── 支払い ──
  const handleTogglePaymentClub = (name: string) => {
    const next = { ...state.paymentClub, [name]: !state.paymentClub[name] }
    setState(s => ({ ...s, paymentClub: next }))
    fbSet('paymentClub', next)
  }

  const handleTogglePaymentParty = (name: string) => {
    const next = { ...state.paymentParty, [name]: !state.paymentParty[name] }
    setState(s => ({ ...s, paymentParty: next }))
    fbSet('paymentParty', next)
  }

  // ── メンバー ──
  const handleToggleLevel = (name: string) => {
    const next: MemberLevel = state.memberLevels[name] === 'exp' ? 'nov' : 'exp'
    setState(s => ({ ...s, memberLevels: { ...s.memberLevels, [name]: next } }))
    fbUpdate('memberLevels', { [name]: next })
  }

  const handleUpdateCourts = (n: number) => {
    if (isNaN(n) || n < 1) return
    setState(s => ({ ...s, courts: n }))
    fbSet('courts', n)
  }

  // ── 試合 ──
  const handleGenerate = (matches: Match[]) => {
    setState(s => ({ ...s, matches }))
    const obj: Record<number, Match> = {}
    matches.forEach((m, i) => { obj[i] = m })
    fbSet('matches', obj)
  }

  const handleUpdateScore = (i: number, side: 1 | 2, val: string) => {
    const next = state.matches.map((m, idx) =>
      idx === i ? { ...m, [side === 1 ? 's1' : 's2']: val } : m
    )
    setState(s => ({ ...s, matches: next }))
    fbUpdate(`matches/${i}`, { [side === 1 ? 's1' : 's2']: val })
  }

  const handleUpdateStatus = (i: number, val: Match['status']) => {
    const next = state.matches.map((m, idx) => idx === i ? { ...m, status: val } : m)
    setState(s => ({ ...s, matches: next }))
    fbUpdate(`matches/${i}`, { status: val })
  }

  // ── 懇親会 ──
  const handleSetParty = (name: string, val: string) => {
    const next = { ...state.party, [name]: val as PartyStatus }
    setState(s => ({ ...s, party: next }))
    fbSet('party', next)
  }

  const handleResetParty = () => {
    setState(s => ({ ...s, party: {} }))
    fbSet('party', {})
  }

  const handleGuestNameRegister = (name: string, status: AttendanceStatus) => {
    saveGuestSession(name, state.activityDate)
    setAuthUser(u => u ? { ...u, name } : null)
    const next = { ...state.attendance, [name]: status }
    setState(s => ({ ...s, attendance: next }))
    fbSet('attendance', next)
  }

  const handleLogout = () => {
    clearSession()
    clearGuestSession()
    setAuthUser(null)
  }

  const handleNameChange = (newName: string) => {
    if (!authUser) return
    const updated = { ...authUser, name: newName }
    setAuthUser(updated)
    saveSession(updated.userId, updated.role, newName)
  }

  return (
    <>
      <div className={`sync-bar ${syncing ? 'active' : ''}`} />

      {showSettings && (
        <SettingsModal
          authUser={authUser}
          onClose={() => setShowSettings(false)}
          onNameChange={handleNameChange}
        />
      )}

      <Header
        attendance={state.attendance}
        matches={state.matches}
        connected={connected}
        syncing={syncing}
        role={role}
        onLogout={handleLogout}
        onOpenSettings={() => setShowSettings(true)}
      />

      <nav className="tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {activeTab === 'home' && (
          <Home
            authUser={authUser}
            state={state}
            isManagementOnly={managementOnlyNames.includes(authUser.name)}
            onSubmitAttendance={handleSubmitAttendance}
            onGuestNameRegister={handleGuestNameRegister}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
          />
        )}
        {activeTab === 'members' && (
          <Members
            attendance={state.attendance}
            memberLevels={state.memberLevels}
            dbLevels={dbLevels}
            memberNames={memberNames}
            managementOnlyNames={managementOnlyNames}
            courts={state.courts}
            role={role}
            maskMap={maskMap}
            paymentClub={state.paymentClub}
            paymentParty={state.paymentParty}
            onToggleLevel={handleToggleLevel}
            onTogglePaymentClub={handleTogglePaymentClub}
            onTogglePaymentParty={handleTogglePaymentParty}
          />
        )}
        {activeTab === 'matches' && (
          <Matches
            attendance={state.attendance}
            memberLevels={{ ...state.memberLevels, ...dbLevels }}
            matches={state.matches}
            courts={state.courts}
            role={role}
            ownerNames={managementOnlyNames}
            maskMap={maskMap}
            onGenerate={handleGenerate}
            onUpdateScore={handleUpdateScore}
            onUpdateStatus={handleUpdateStatus}
            onUpdateCourts={handleUpdateCourts}
          />
        )}
        {activeTab === 'results' && (
          <Results
            attendance={state.attendance}
            memberLevels={state.memberLevels}
            matches={state.matches}
            maskMap={maskMap}
          />
        )}
        {activeTab === 'party' && (
          <Party
            attendance={state.attendance}
            party={state.party}
            role={role}
            authUserName={authUser.name}
            maskMap={maskMap}
            onSetParty={handleSetParty}
            onResetParty={handleResetParty}
          />
        )}
        {activeTab === 'admin' && (role === 'admin' || role === 'owner') && (
          <Admin currentRole={role} />
        )}
      </main>
    </>
  )
}
