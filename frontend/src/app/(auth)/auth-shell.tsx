import type { ReactNode } from 'react';

/** Centered logo + title frame shared by the public account pages. */
export function AuthShell({ subtitle, wide = false, children }: { subtitle: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className={`w-full ${wide ? 'max-w-md' : 'max-w-sm'}`}>
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text">Translation Assistant</h1>
          <p className="text-text-secondary text-sm mt-1">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
