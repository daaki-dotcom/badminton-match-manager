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

export function useFirebase() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const writeCount = useRef(0)

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
    const unsubData = onValue(ref(db, ROOT), (snap) => {
      if (writeCount.current > 0) return
      const data = snap.val() || {}

      let attendance   = data.attendance   || {}
      let activityDate = data.activityDate || ''
      let party        = data.party        || {}
      let paymentClub  = data.paymentClub  || {}
      let paymentParty = data.paymentParty || {}
      let memberLevels = data.memberLevels || {}

      if (activityDate) {
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
          attendance   = {}
          activityDate = ''
          party        = {}
          paymentClub  = {}
          paymentParty = {}
          memberLevels = {}
        }
      }

      setState({
        attendance,
        memberLevels,
        activityDate,
        courts:  data.courts ?? 2,
        matches: data.matches ? Object.values(data.matches) as Match[] : [],
        party,
        paymentClub,
        paymentParty,
      })
      setLoading(false)
    })

    const unsubConnected = onValue(ref(db, '.info/connected'), (snap) => {
      setConnected(snap.val() === true)
    })

    return () => { unsubData(); unsubConnected() }
  }, [])

  return { state, setState, connected, loading, syncing, fbSet, fbUpdate }
}
