import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, ChartNoAxesCombined, Compass, Library, ListMusic, Menu, Palette, Settings, UserRound, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Logo, Button } from './ui';
import { ProviderCredits } from './ProviderCredits';

const navigation = [
  { to: '/app', label: 'Journal', icon: BookOpen, end: true },
  { to: '/app/discover', label: 'Discover', icon: Compass },
  { to: '/app/library', label: 'Library', icon: Library },
  { to: '/app/collections', label: 'Collections', icon: ListMusic },
  { to: '/app/insights', label: 'Insights', icon: ChartNoAxesCombined },
];

const pageTitles: Record<string, string> = {
  '/app': 'Your journal', '/app/discover': 'Discover', '/app/library': 'The library',
  '/app/collections': 'Collections', '/app/insights': 'Insights', '/app/settings': 'Account settings',
};

export function AppShell() {
  const { user } = useAuth();
  const { preference, cycle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [rail, setRail] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const title = pageTitles[location.pathname] || (location.pathname.includes('/title/') ? 'Title details' : location.pathname.includes('/collections/') ? 'A collection' : 'Showgraphy');

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setRail((value) => !value);
      }
      if (event.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  return <div className={`app-frame ${rail ? 'app-frame--rail' : ''} ${drawer ? 'app-frame--drawer' : ''}`}>
    {drawer && <button className="drawer-scrim" aria-label="Close navigation" onClick={() => setDrawer(false)} />}
    <aside className="app-sidebar" id="primary-navigation" aria-label="Primary navigation">
      <div className="sidebar-brand"><NavLink to="/app" aria-label="Showgraphy journal"><Logo compact={rail} /></NavLink><button className="sidebar-close" aria-label="Close navigation" onClick={() => setDrawer(false)}><X size={18} /></button></div>
      <button className="rail-toggle" aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!rail} aria-controls="primary-navigation" onClick={() => setRail((value) => !value)} title={rail ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}><span>‹</span></button>
      <nav className="primary-nav">
        <p className="nav-label">The collection</p>
        {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setDrawer(false)} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} title={rail ? label : undefined}>
          <Icon size={18} strokeWidth={1.7} /><span className="nav-link__label">{label}</span><span className="nav-link__tip">{label}</span>
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/app/settings" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} title={rail ? 'Settings' : undefined} onClick={() => setDrawer(false)}><Settings size={18} strokeWidth={1.7} /><span className="nav-link__label">Settings</span><span className="nav-link__tip">Settings</span></NavLink>
        <NavLink to={`/u/${user?.username || ''}`} className="account-link" title={rail ? user?.username : undefined} onClick={() => setDrawer(false)}>
          {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="avatar-fallback"><UserRound size={16} /></span>}
          <span className="account-link__text"><strong>@{user?.username}</strong></span>
        </NavLink>
      </div>
    </aside>
    <div className="app-main">
      <header className="app-topbar">
        <button className="mobile-menu" aria-label="Open navigation" aria-expanded={drawer} aria-controls="primary-navigation" onClick={() => setDrawer(true)}><Menu size={20} /></button>
        <div className="topbar-title"><span className="topbar-kicker">showgraphy</span><span>{title}</span></div>
        <div className="topbar-actions">
          <NavLink className="topbar-search" to="/app/discover"><Compass size={16} /><span>Find a title</span><kbd>/</kbd></NavLink>
          <Button variant="quiet" className="theme-toggle" onClick={cycle} aria-label={`Current theme: ${preference}. Cycle color theme`} title={`Theme: ${preference}`}>
            <Palette size={17} />
          </Button>
          <Button variant="quiet" className="mobile-settings" aria-label="Account settings" onClick={() => navigate('/app/settings')}><Settings size={17} /></Button>
        </div>
      </header>
      <main className="app-content"><Outlet /></main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => `mobile-nav__item${isActive ? ' is-active' : ''}`}><Icon size={19} /><span>{label}</span></NavLink>)}
      </nav>
      <footer className="app-footer"><span>A personal record of what moved you.</span><ProviderCredits /></footer>
    </div>
  </div>;
}
