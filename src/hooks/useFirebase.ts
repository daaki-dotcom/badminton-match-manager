import { useState, useEffect, useRef } from 'react'
import { ref, onValue, set, update } from 'firebase/database'
import { db, ROOT } from '../firebase'
import { AppState, Match } from '../types'

const DEFAULT_STATE: AppState = {
  attendance:   {},
  memberLevels: {},
  activityDate: '',
  courts:       2,
  matches:      [],
  party:        {},
  paymentClub:  {},
  paymentParty: {},
}

// useFirebaseが監視するパスの一覧（loadingの完了判定に使う）
const WATCHED_PATHS = ['attendance', 'memberLevels', 'activityDate', 'courts', 'matches', 'party', 'paymentClub', 'paymentParty']

export function useFirebase() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const writeCount = useRef(0)
  const loadedPaths = useRef(new Set<string>())

  const fbSet = async (path: string, value: unknown) => {
    writeCount.current++
    setSyncing(true)
    await set(ref(db, `${ROOT}/${path}`), value)
    writeCount.current--
    if (writeCount.current === 0) setSyncing(false)
  }

  const fbUpdate = async (path: string, value: Record<string, unknown>) => {
    writeCount.current++
    setSyncing(true)
    await update(ref(db, `${ROOT}/${path}`), value)
    writeCount.current--
    if (writeCount.current === 0) setSyncing(false)
  }

  useEffect(() => {
    // 必要なデータだけを個別に監視する（badminton以下を丸ごと監視すると、
    // 無関係なデータ（users・chouseisanEntries等）が変わるたびにも
    // 全接続者に再送信されてしまうため、パスごとに分けている）
    const markLoaded = (path: string) => {
      loadedPaths.current.add(path)
      if (loadedPaths.current.size >= WATCHED_PATHS.length) setLoading(false)
    }

    const unsubAttendance = onValue(ref(db, `${ROOT}/attendance`), snap => {
      if (writeCount.current > 0) return
      setState(prev => ({ ...prev, attendance: snap.val() || {} }))
      markLoaded('attendance')
    })

    const unsubMemberLevels = onValue(ref(db, `${ROOT}/memberLevels`), snap => {
      if (writeCount.current > 0) return
      setState(prev => ({ ...prev, memberLevels: snap.val() || {} }))
      markLoaded('memberLevels')
    })

    const unsubCourts = onValue(ref(db, `${ROOT}/courts`), snap => {
      if (writeCount.current > 0) return
      setState(prev => ({ ...prev, courts: snap.val() ?? 2 }))
      markLoaded('courts')
    })

    const unsubMatches = onValue(ref(db, `${ROOT}/matches`), snap => {
      if (writeCount.current > 0) return
      const data = snap.val()
      setState(prev => ({ ...prev, matches: data ? Object.values(data) as Match[] : [] }))
      markLoaded('matches')
    })

    const unsubParty = onValue(ref(db, `${ROOT}/party`), snap => {
      if (writeCount.current > 0) return
      setState(prev => ({ ...prev, party: snap.val() || {} }))
      markLoaded('party')
    })

    const unsubPaymentClub = onValue(ref(db, `${ROOT}/paymentClub`), snap => {
      if (writeCount.current > 0) return
      setState(prev => ({ ...prev, paymentClub: snap.val() || {} }))
      markLoaded('paymentClub')
    })

    const unsubPaymentParty = onValue(ref(db, `${ROOT}/paymentParty`), snap => {
      if (writeCount.current > 0) return
      setState(prev => ({ ...prev, paymentParty: snap.val() || {} }))
      markLoaded('paymentParty')
    })

    const unsubActivityDate = onValue(ref(db, `${ROOT}/activityDate`), snap => {
      if (writeCount.current > 0) return
      const activityDate = snap.val() || ''
      setState(prev => ({ ...prev, activityDate }))
      markLoaded('activityDate')

      if (!activityDate) return
      const endOfDay = new Date(activityDate)
      endOfDay.setHours(23, 59, 59, 999)

      // 活動日終了後：ゲスト認証情報を削除（参加者名は7日後まで残す）
      if (new Date() > endOfDay) {
        fbSet('guestUsers', {})
      }

      // 活動日から7日後：全活動データをリセット
      const deadline = new Date(activityDate)
      deadline.setDate(deadline.getDate() + 7)
      if (new Date() > deadline) {
        fbSet('attendance',   {})
        fbSet('activityDate', '')
        fbSet('matches',      {})
        fbSet('guestUsers',   {})
        fbSet('party',        {})
        fbSet('paymentClub',  {})
        fbSet('paymentParty', {})
        fbSet('memberLevels', {})
      }
    })

    const unsubConnected = onValue(ref(db, '.info/connected'), (snap) => {
      setConnected(snap.val() === true)
    })

    return () => {
      unsubAttendance(); unsubMemberLevels(); unsubCourts(); unsubMatches()
      unsubParty(); unsubPaymentClub(); unsubPaymentParty(); unsubActivityDate()
      unsubConnected()
    }
  }, [])

  return { state, setState, connected, loading, syncing, fbSet, fbUpdate }
}
