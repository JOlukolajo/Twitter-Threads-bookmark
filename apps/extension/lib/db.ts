import { openDB } from '@saveboard/core';

/** One Dexie instance per extension context (background, app page, popup). */
export const db = openDB();
