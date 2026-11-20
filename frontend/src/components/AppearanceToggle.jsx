import React from 'react';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';

// Light, dark, or follow the device. The choice stays on this device.
const ORDER = ['auto', 'light', 'dark'];
const AppearanceToggle = ({ className = '' }) => {
  const { userMode, setUserMode, mode } = useTheme(); const { t } = useLang();
  const next = ORDER[(ORDER.indexOf(userMode) + 1) % ORDER.length];
  const Icon = userMode === 'auto' ? MonitorSmartphone : userMode === 'dark' ? Moon : Sun;
  const word = userMode === 'auto' ? `Follows your device (${mode})` : userMode === 'dark' ? 'Dark' : 'Light';
  return (
    <button type="button" onClick={() => setUserMode(next)} data-no-i18n aria-label={`${t('Appearance')}: ${t(word.replace(/ \(.*\)/, ''))}`} title={`${t('Appearance')}: ${t(word.replace(/ \(.*\)/, ''))}. ${t('Click to change.')}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#2a5cac] bg-[#ffffff] px-2.5 py-2 text-sm font-bold text-[#2a5cac] transition hover:bg-[#eef2f8] sm:px-3 ${className}`}>
      <Icon size={16} aria-hidden="true" /><span className="sr-only">{t('Appearance')}</span>
    </button>
  );
};
export default AppearanceToggle;
