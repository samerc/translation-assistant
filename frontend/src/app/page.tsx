'use client';

import { useTheme, Palette } from '@/lib/theme-context';

const palettes: { id: Palette; name: string; color: string }[] = [
  { id: 'indigo', name: 'Indigo Minimal', color: '#4F46E5' },
  { id: 'ocean', name: 'Ocean Blue', color: '#1E40AF' },
  { id: 'teal', name: 'Teal Focus', color: '#0D9488' },
  { id: 'slate', name: 'Slate & Amber', color: '#334155' },
];

export default function Dashboard() {
  const { palette, setPalette } = useTheme();

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-6">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard title="Active Jobs" value="0" />
        <SummaryCard title="Revenue (Month)" value="$0" />
        <SummaryCard title="Pending Invoices" value="0" />
        <SummaryCard title="Due This Week" value="0" />
      </div>

      {/* Palette preview */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Theme Preview</h2>
        <p className="text-text-secondary mb-4 text-sm">Select a color palette:</p>
        <div className="flex gap-3 mb-6 flex-wrap">
          {palettes.map((p) => (
            <button
              key={p.id}
              onClick={() => setPalette(p.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                palette === p.id
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border text-text-secondary hover:border-primary/50'
              }`}
            >
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </button>
          ))}
        </div>

        {/* Color swatches */}
        <div className="flex gap-3 flex-wrap">
          <Swatch label="Primary" className="bg-primary" />
          <Swatch label="Accent" className="bg-accent" />
          <Swatch label="Success" className="bg-success" />
          <Swatch label="Warning" className="bg-warning" />
          <Swatch label="Danger" className="bg-danger" />
          <Swatch label="Neutral" className="bg-neutral" />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-2xl font-bold text-text">{value}</div>
      <div className="text-sm text-text-muted mt-1">{title}</div>
    </div>
  );
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="text-center">
      <div className={`w-14 h-14 rounded-xl ${className}`} />
      <span className="text-xs text-text-muted mt-1 block">{label}</span>
    </div>
  );
}
