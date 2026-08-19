import { useEffect, useState } from 'react'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { CalendarView } from './components/CalendarView'
import { CoachDashboardAlerts } from './components/CoachDashboardAlerts'
import { CoachAlertListView } from './components/CoachAlertListView'
import { CoachDetailView } from './components/CoachDetailView'
import { GroupDetailView } from './components/GroupDetailView'
import { GroupsView } from './components/GroupsView'
import { Header } from './components/Header'
import { LoginScreen } from './components/LoginScreen'
import { PlayerDetailView } from './components/PlayerDetailView'
import { StatisticsView } from './components/StatisticsView'
import { TrainingAttendanceView } from './components/TrainingAttendanceView'
import { supabase } from './supabaseClient'
import { parseGroupIds, toLocalDateInput } from './utils'

function createRouteState({ screen, selectedGroup = null, selectedPlayer = null, selectedCoach = null, selectedTraining = null, alertType = null, returnTarget = 'groups', calendarSelectedDate }) {
  return {
    screen,
    selectedGroup,
    selectedPlayer,
    selectedCoach,
    selectedTraining,
    alertType,
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
  const [selectedTraining, setSelectedTraining] = useState(null)
  const [alertType, setAlertType] = useState(null)
  const [dismissedAlerts, setDismissedAlerts] = useState([])
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toLocalDateInput(new Date()))
  const [returnTarget, setReturnTarget] = useState('groups')

  function applyRouteState(routeState, method = null) {
    const nextState = createRouteState({
      screen: routeState.screen || 'calendar',
      selectedGroup: routeState.selectedGroup || null,
      selectedPlayer: routeState.selectedPlayer || null,
      selectedCoach: routeState.selectedCoach || null,
      selectedTraining: routeState.selectedTraining || null,
      alertType: routeState.alertType || null,
      returnTarget: routeState.returnTarget || 'groups',
      calendarSelectedDate: routeState.calendarSelectedDate || toLocalDateInput(new Date()),
    })

    setScreen(nextState.screen)
    setSelectedGroup(nextState.selectedGroup)
    setSelectedPlayer(nextState.selectedPlayer)
    setSelectedCoach(nextState.selectedCoach)
    setSelectedTraining(nextState.selectedTraining)
    setAlertType(nextState.alertType)
    setReturnTarget(nextState.returnTarget)
    setCalendarSelectedDate(nextState.calendarSelectedDate)

    if (method === 'push') {
      window.history.pushState(nextState, '')
    } else if (method === 'replace') {
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
      applyRouteState(state)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [session])

  function handleLogin(user) {
    setSession(user)
    setDismissedAlerts([])
    applyRouteState(createRouteState({ screen: 'calendar', calendarSelectedDate }), 'replace')
  }

  function handleLogout() {
    setSession(null)
    window.history.replaceState(null, '')
    setScreen('calendar')
    setSelectedGroup(null)
    setSelectedPlayer(null)
    setSelectedCoach(null)
    setSelectedTraining(null)
    setAlertType(null)
    setDismissedAlerts([])
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
      screen: 'training-attendance',
      selectedGroup: {
        id: training.gid,
        name: training.gname || 'Grupa',
        uzrast: training.uzrast || '',
        pol: '',
      },
      selectedTraining: training,
      returnTarget: 'calendar',
      calendarSelectedDate: training.date || calendarSelectedDate,
    }))
  }

  function handleOpenAlert(alert) {
    navigate(createRouteState({
      screen: 'coach-alerts',
      alertType: alert,
      returnTarget: 'calendar',
      calendarSelectedDate,
    }))
  }

  function handleBack() {
    window.history.back()
  }

  function handleCalendarDateChange(date) {
    setCalendarSelectedDate(date)
    if (window.history.state) {
      window.history.replaceState({ ...window.history.state, calendarSelectedDate: date }, '')
    }
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <Header user={session} onLogout={handleLogout} />
      {screen === 'calendar' ? <CoachDashboardAlerts user={session} dismissedAlerts={dismissedAlerts} onOpenAlert={handleOpenAlert} /> : null}
      {screen === 'calendar' ? <CalendarView user={session} selectedDate={calendarSelectedDate} onDateChange={handleCalendarDateChange} onOpenTraining={handleOpenTraining} /> : null}
      {screen === 'groups' ? <GroupsView user={session} onOpenGroup={handleOpenGroup} onOpenPlayer={handleOpenPlayer} /> : null}
      {screen === 'group-detail' && selectedGroup ? <GroupDetailView group={selectedGroup} user={session} initialDate={calendarSelectedDate} onBack={handleBack} onOpenPlayer={handleOpenPlayer} /> : null}
      {screen === 'training-attendance' && selectedTraining ? <TrainingAttendanceView training={selectedTraining} group={selectedGroup} onBack={handleBack} /> : null}
      {screen === 'coach-alerts' && alertType ? <CoachAlertListView user={session} alertType={alertType} onBack={handleBack} onMarkRead={(type) => setDismissedAlerts((current) => current.includes(type) ? current : [...current, type])} /> : null}
      {screen === 'player-detail' && selectedPlayer ? <PlayerDetailView player={selectedPlayer} user={session} onBack={handleBack} /> : null}
      {screen === 'statistics' ? <StatisticsView user={session} onOpenGroup={handleOpenGroup} onOpenPlayer={handleOpenPlayer} onOpenCoach={handleOpenCoach} /> : null}
      {screen === 'coach-detail' && selectedCoach ? <CoachDetailView coach={selectedCoach} user={session} onBack={handleBack} onOpenGroup={handleOpenGroup} /> : null}
      <BottomNav current={screen} onNavigate={(next) => {
        const nextState = createRouteState({
          screen: next,
          selectedGroup: null,
          selectedPlayer: null,
          selectedCoach: null,
          selectedTraining: null,
          alertType: null,
          returnTarget: next === 'calendar' ? 'groups' : returnTarget,
          calendarSelectedDate,
        })
        if (next !== screen) navigate(nextState)
      }} />
    </div>
  )
}

export default App
