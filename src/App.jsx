import { useEffect, useState } from 'react'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { CalendarView } from './components/CalendarView'
import { CoachDetailView } from './components/CoachDetailView'
import { GroupDetailView } from './components/GroupDetailView'
import { GroupsView } from './components/GroupsView'
import { Header } from './components/Header'
import { LoginScreen } from './components/LoginScreen'
import { MedicalAlerts } from './components/MedicalAlerts'
import { PlayerDetailView } from './components/PlayerDetailView'
import { StatisticsView } from './components/StatisticsView'
import { supabase } from './supabaseClient'
import { parseGroupIds, toLocalDateInput } from './utils'

function createRouteState({ screen, selectedGroup = null, selectedPlayer = null, selectedCoach = null, returnTarget = 'groups', calendarSelectedDate }) {
  return {
    screen,
    selectedGroup,
    selectedPlayer,
    selectedCoach,
    returnTarget,
    calendarSelectedDate,
  }
}

function App() {
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('sk-volley-session')
    return saved ? JSON.parse(saved) : null
  })
  const [screen, setScreen] = useState('calendar')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [selectedCoach, setSelectedCoach] = useState(null)
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toLocalDateInput(new Date()))
  const [returnTarget, setReturnTarget] = useState('groups')

  function applyRouteState(routeState, method = 'replace') {
    const nextState = createRouteState({
      screen: routeState.screen || 'calendar',
      selectedGroup: routeState.selectedGroup || null,
      selectedPlayer: routeState.selectedPlayer || null,
      selectedCoach: routeState.selectedCoach || null,
      returnTarget: routeState.returnTarget || 'groups',
      calendarSelectedDate: routeState.calendarSelectedDate || toLocalDateInput(new Date()),
    })

    setScreen(nextState.screen)
    setSelectedGroup(nextState.selectedGroup)
    setSelectedPlayer(nextState.selectedPlayer)
    setSelectedCoach(nextState.selectedCoach)
    setReturnTarget(nextState.returnTarget)
    setCalendarSelectedDate(nextState.calendarSelectedDate)

    if (method === 'push') {
      window.history.pushState(nextState, '')
    } else {
      window.history.replaceState(nextState, '')
    }
  }

  function navigate(nextState) {
    applyRouteState(nextState, 'push')
  }

  useEffect(() => {
    if (session) {
      localStorage.setItem('sk-volley-session', JSON.stringify(session))
    } else {
      localStorage.removeItem('sk-volley-session')
    }
  }, [session])

  useEffect(() => {
    if (!session?.id) return

    let cancelled = false

    async function refreshSessionUser() {
      const { data } = await supabase.from('users').select('*').eq('id', session.id).single()
      if (cancelled || !data) return
      setSession({
        id: data.id,
        name: data.name,
        role: data.role,
        username: data.username,
        group_ids: parseGroupIds(data.group_ids),
      })
    }

    refreshSessionUser()
    return () => {
      cancelled = true
    }
  }, [session?.id])

  useEffect(() => {
    if (!session) return
    if (!window.history.state) {
      applyRouteState(createRouteState({ screen: 'calendar', calendarSelectedDate }), 'replace')
    }

    const handlePopState = (event) => {
      const state = event.state || createRouteState({ screen: 'calendar', calendarSelectedDate })
      applyRouteState(state, 'replace')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [session])

  function handleLogin(user) {
    setSession(user)
    applyRouteState(createRouteState({ screen: 'calendar', calendarSelectedDate }), 'replace')
  }

  function handleLogout() {
    setSession(null)
    window.history.replaceState(null, '')
    setScreen('calendar')
    setSelectedGroup(null)
    setSelectedPlayer(null)
    setSelectedCoach(null)
  }

  function handleOpenGroup(group, fromScreen = 'groups') {
    navigate(createRouteState({ screen: 'group-detail', selectedGroup: group, returnTarget: fromScreen, calendarSelectedDate }))
  }

  function handleOpenPlayer(player, fromScreen = returnTarget) {
    navigate(createRouteState({ screen: 'player-detail', selectedPlayer: player, selectedGroup, returnTarget: fromScreen, calendarSelectedDate }))
  }

  function handleOpenCoach(coach) {
    navigate(createRouteState({ screen: 'coach-detail', selectedCoach: coach, returnTarget: 'statistics', calendarSelectedDate }))
  }

  function handleOpenTraining(training) {
    if (!training?.gid) return
    navigate(createRouteState({
      screen: 'group-detail',
      selectedGroup: {
        id: training.gid,
        name: training.gname || 'Grupa',
        uzrast: training.uzrast || '',
        pol: '',
      },
      returnTarget: 'calendar',
      calendarSelectedDate: training.date || calendarSelectedDate,
    }))
  }

  function handleBack() {
    window.history.back()
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <Header user={session} onLogout={handleLogout} />
      <MedicalAlerts user={session} />
      {screen === 'calendar' ? <CalendarView user={session} selectedDate={calendarSelectedDate} onDateChange={setCalendarSelectedDate} onOpenTraining={handleOpenTraining} /> : null}
      {screen === 'groups' ? <GroupsView user={session} onOpenGroup={handleOpenGroup} onOpenPlayer={handleOpenPlayer} /> : null}
      {screen === 'group-detail' && selectedGroup ? <GroupDetailView group={selectedGroup} user={session} initialDate={calendarSelectedDate} onBack={handleBack} onOpenPlayer={handleOpenPlayer} /> : null}
      {screen === 'player-detail' && selectedPlayer ? <PlayerDetailView player={selectedPlayer} user={session} onBack={handleBack} /> : null}
      {screen === 'statistics' ? <StatisticsView user={session} onOpenGroup={handleOpenGroup} onOpenPlayer={handleOpenPlayer} onOpenCoach={handleOpenCoach} /> : null}
      {screen === 'coach-detail' && selectedCoach ? <CoachDetailView coach={selectedCoach} user={session} onBack={handleBack} onOpenGroup={handleOpenGroup} /> : null}
      <BottomNav current={screen} onNavigate={(next) => {
        const nextState = createRouteState({
          screen: next,
          selectedGroup: null,
          selectedPlayer: null,
          selectedCoach: null,
          returnTarget: next === 'calendar' ? 'groups' : returnTarget,
          calendarSelectedDate,
        })
        navigate(nextState)
      }} />
    </div>
  )
}

export default App
