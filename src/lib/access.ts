import { createContext, useContext } from 'react';

// Pages that can be shared with a view key.
export type SharePage = 'hm' | 'kol' | 'threads' | 'gsc' | 'fyp';
export const SHARE_PAGES: { key: SharePage; label: string }[] = [
  { key: 'hm', label: 'Homeless Media' },
  { key: 'kol', label: 'KOL' },
  { key: 'threads', label: 'Threads' },
  { key: 'gsc', label: 'Search Console' },
  { key: 'fyp', label: 'The FYP Leak' },
];

export type Access = {
  guest: boolean;   // signed in through a view key (read only)
  member: boolean;  // team member (row in user_roles)
  admin: boolean;   // super admin
  pages: SharePage[]; // pages this viewer may open
  label?: string;
};

export const FULL_ACCESS: Access = { guest: false, member: true, admin: false, pages: SHARE_PAGES.map(p => p.key) };
export const AccessContext = createContext<Access>(FULL_ACCESS);
export const useAccess = () => useContext(AccessContext);

export const viewLink = (key: string) => `${window.location.origin}/login?view_key=${key}`;
