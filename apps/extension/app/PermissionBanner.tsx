import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui';

/**
 * Firefox (MV3) treats host permissions as opt-in, so they may be missing after
 * install. Chrome grants them at install time and this banner never shows there.
 */
export function PermissionBanner() {
  const origins = (browser.runtime.getManifest().host_permissions ?? []) as string[];
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    browser.permissions
      .contains({ origins })
      .then((ok) => setMissing(!ok))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!missing) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <span className="flex-1">Saveboard needs access to X and Threads to read your saved posts.</span>
      <Button variant="primary" size="sm" onClick={async () => setMissing(!(await browser.permissions.request({ origins })))}>
        Grant access
      </Button>
    </div>
  );
}
