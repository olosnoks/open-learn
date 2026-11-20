import { Navigate, Route, Routes } from 'react-router-dom';
import { JoinScreen } from './features/player/JoinScreen';
import { PlayerGame } from './features/player/PlayerGame';
import { HostLobby } from './features/host/HostLobby';
import { HostGame } from './features/host/HostGame';
import { CreateSessionPage } from './features/host/CreateSessionPage';
import { SessionsHistoryPage } from './features/host/SessionsHistoryPage';
import { QuizListPage } from './features/quiz-editor/QuizListPage';
import { QuizEditorPage } from './features/quiz-editor/QuizEditorPage';
import { SessionResultsPage } from './features/results/SessionResultsPage';
import { QuizImportPage } from './features/quiz-import/QuizImportPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';

const getHostToken = () => sessionStorage.getItem('hostToken') ?? '';

// Read the token when the route renders, not when <App> first mounts: <App> doesn't
// re-render on navigation, so an inline getHostToken() would stay stuck at ''.
const HostLobbyRoute = () => <HostLobby hostToken={getHostToken()} />;
const HostGameRoute = () => <HostGame hostToken={getHostToken()} />;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/join" replace />} />
      <Route path="/join" element={<JoinScreen />} />
      <Route path="/join/:code" element={<JoinScreen />} />
      <Route path="/play/:code" element={<PlayerGame />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Host-only: redirects to /login when /api/auth/me says 401. */}
      <Route element={<RequireAuth />}>
        <Route path="/host/create" element={<CreateSessionPage />} />
        <Route path="/host/:sessionId/:code" element={<HostLobbyRoute />} />
        <Route path="/host/:sessionId/:code/game" element={<HostGameRoute />} />
        <Route path="/quizzes" element={<QuizListPage />} />
        <Route path="/quizzes/new" element={<QuizEditorPage isNew />} />
        <Route path="/quizzes/import" element={<QuizImportPage />} />
        <Route path="/quizzes/:id" element={<QuizEditorPage isNew={false} />} />
        <Route path="/sessions" element={<SessionsHistoryPage />} />
        <Route path="/sessions/:id" element={<SessionResultsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  );
}
