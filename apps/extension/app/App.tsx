import { useEffect } from 'react';
import { PLATFORMS, type Platform } from '@saveboard/core';
import { navigate, useHashPath } from './router';
import { useSettings } from './hooks';
import { ModePicker } from './ModePicker';
import { Workspace } from './Workspace';
import { SettingsPage } from './SettingsPage';
import { PrivacyPage } from './PrivacyPage';

export function App() {
  const path = useHashPath();
  const [settings, updateSettings] = useSettings();
  const [, first, rest] = path.match(/^\/([^/?]*)(.*)$/) ?? [];
  const platform = PLATFORMS.includes(first as Platform) ? (first as Platform) : null;

  // Reopen the last mode unless the user asked to always pick.
  useEffect(() => {
    if (path === '/' && settings.lastMode && !settings.alwaysShowPicker && !sessionStorage.getItem('picked')) {
      navigate(`/${settings.lastMode}`);
    }
  }, [path, settings.lastMode, settings.alwaysShowPicker]);

  useEffect(() => {
    if (platform) {
      sessionStorage.setItem('picked', '1');
      if (settings.lastMode !== platform) void updateSettings({ lastMode: platform });
      document.title = `Saveboard · ${platform === 'x' ? 'X' : 'Threads'}`;
    } else document.title = 'Saveboard';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  if (platform) return <Workspace key={platform} platform={platform} subpath={rest ?? ''} />;
  if (first === 'settings') return <SettingsPage />;
  if (first === 'privacy') return <PrivacyPage />;
  return <ModePicker />;
}
