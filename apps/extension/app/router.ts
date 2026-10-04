import { useEffect, useState } from 'react';

/** Minimal hash router: #/ (mode picker), #/x, #/threads, #/settings, #/privacy. */
export function useHashPath(): string {
  const read = () => location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function navigate(path: string): void {
  location.hash = path;
}
