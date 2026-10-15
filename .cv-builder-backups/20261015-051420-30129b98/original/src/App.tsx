import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useAppStore } from '@/store/useAppStore';
import { DashboardView } from '@/views/DashboardView';
import { useFontLoader } from '@/hooks/useFontLoader';

function App() {
  const loadFromStorage = useAppStore((s) => s.loadFromStorage);
  const activeProfileId = useAppStore((s) => s.activeProfileId);

  // Load persisted state on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const { isLoaded: fontsLoaded, error: fontError } = useFontLoader();

  // Render current step view
  const renderStepView = () => {
    if (!activeProfileId) return null;
    if (fontError) return <div className="p-10 text-red-500">Error loading fonts: {fontError}</div>;
    if (!fontsLoaded) return <div className="p-10 text-on-surface">Loading PDF Engine...</div>;

    return <DashboardView />;
  };

  return (
    <AppShell>
      {renderStepView()}
    </AppShell>
  );
}

export default App;
