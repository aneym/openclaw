import { useState } from 'react';
import { Palette } from 'lucide-react';
import { AppearanceSettings } from './AppearanceSettings';

type SettingsSection = 'appearance';

const sections = [
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
];

export function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

  return (
    <div className="flex h-full">
      {/* Settings sidebar nav */}
      <div className="w-48 border-r border-border p-4 flex-shrink-0">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>
        <nav className="space-y-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
        {activeSection === 'appearance' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Appearance</h2>
            <AppearanceSettings />
          </div>
        )}
      </div>
    </div>
  );
}
