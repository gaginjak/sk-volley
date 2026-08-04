import { useEffect, useState } from 'react'
import './App.css'
import { BottomNav } from './components/BottomNav'
import { CalendarView } from './components/CalendarView'
import { GroupDetailView } from './components/GroupDetailView'
import { GroupsView } from './components/GroupsView'
import { Header } from './components/Header'
import { LoginScreen } from './components/LoginScreen'
import { MedicalAlerts } from './components/MedicalAlerts'
import { PlayerDetailView } from './components/PlayerDetailView'
import { StatisticsView } from './components/StatisticsView'
import { toLocalDateInput } from './utils'

function App() {
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('sk-volley-session')
    return saved ? JSON.parse(saved) : null
  })
  const [screen, setScreen] = useState('calendar')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => toLocalDateInput(new Date()))
  const [returnTarget, setReturnTarget] = useState('groups')

  useEffect(() => {
    if (session) {
      localStorage.setItem('sk-volley-session', JSON.stringify(session))
    } else {
      localStorage.removeItem('sk-volley-session')
    }
  }, [session])

  function handleLogin(user) {
    setSession(user)
    setScreen('calendar')
  }

  function handleLogout() {
    setSession(null)
    setScreen('calendar')
    setSelectedGroup(null)
    setSelectedPlayer(null)
  }

  function handleOpenGroup(group) {
    setSelectedGroup(group)
    setReturnTarget('groups')
    setScreen('group-detail')
  }

  function handleOpenPlayer(player) {
    setSelectedPlayer(player)
    setScreen('player-detail')
  }

  function handleOpenTraining(training) {
    if (!training?.gid) return
    setSelectedGroup({
      id: training.gid,
      name: training.gname || 'Grupa',
      uzrast: training.uzrast || '',
      pol: '',
    })
    setReturnTarget('calendar')
    setCalendarSelectedDate(training.date || calendarSelectedDate)
    setScreen('group-detail')
  }

  function handleBack() {
    if (selectedPlayer) {
      setSelectedPlayer(null)
      setScreen('group-detail')
      return
    }
    if (selectedGroup) {
      setSelectedGroup(null)
      setScreen(returnTarget === 'calendar' ? 'calendar' : 'groups')
      return
    }
    setScreen('calendar')
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <Header user={session} onLogout={handleLogout} />
      <MedicalAlerts user={session} />
      {screen === 'calendar' ? <CalendarView user={session} selectedDate={calendarSelectedDate} onDateChange={setCalendarSelectedDate} onOpenTraining={handleOpenTraining} /> : null}
      {screen === 'groups' ? <GroupsView user={session} onOpenGroup={handleOpenGroup} /> : null}
      {screen === 'group-detail' && selectedGroup ? <GroupDetailView group={selectedGroup} user={session} initialDate={calendarSelectedDate} onBack={handleBack} onOpenPlayer={handleOpenPlayer} /> : null}
      {screen === 'player-detail' && selectedPlayer ? <PlayerDetailView player={selectedPlayer} user={session} onBack={handleBack} /> : null}
      {screen === 'statistics' ? <StatisticsView user={session} /> : null}
      <BottomNav current={screen} onNavigate={(next) => { setScreen(next); if (next !== 'group-detail') setSelectedGroup(null); if (next !== 'player-detail') setSelectedPlayer(null); if (next === 'calendar') setReturnTarget('groups') }} />
    </div>
  )
}

export default App
