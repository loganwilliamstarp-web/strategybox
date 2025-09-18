// Clean App component for frontend rebuild
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/api';
import Dashboard from './pages/dashboard-clean';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
