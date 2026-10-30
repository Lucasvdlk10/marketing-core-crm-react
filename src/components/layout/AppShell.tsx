import {useEffect,useState,type ReactNode} from 'react';
import {Sidebar,type WorkspaceIdentity} from './Sidebar';
import {Header} from './Header';

export function AppShell({workspace,userName,userAvatar,role='admin',visibleModules,onLogout=()=>{},children}:{workspace:WorkspaceIdentity;userName:string;userAvatar?:string|null;role?:'admin'|'employee';visibleModules?:ReadonlySet<string>;onLogout?:()=>void;children:ReactNode}){
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const closeMobileNavigation=()=>setMobileNavOpen(false);

  useEffect(()=>{
    if(!mobileNavOpen)return;
    const previousOverflow=document.body.style.overflow;
    const sidebar=document.getElementById('primary-navigation');
    const focusableItems=()=>Array.from(sidebar?.querySelectorAll<HTMLElement>('.sidebar-close, .nav-item')??[]);
    focusableItems()[0]?.focus();
    const handleKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){closeMobileNavigation();return}
      if(event.key!=='Tab')return;
      const items=focusableItems();
      const first=items[0];
      const last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    };
    document.body.style.overflow='hidden';
    window.addEventListener('keydown',handleKeyDown);
    return()=>{
      document.body.style.overflow=previousOverflow;
      window.removeEventListener('keydown',handleKeyDown);
      document.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus();
    };
  },[mobileNavOpen]);

  return <div className={`app-shell ${mobileNavOpen?'mobile-nav-open':''}`}>
    <Sidebar workspace={workspace} role={role} visibleModules={visibleModules} open={mobileNavOpen} onNavigate={closeMobileNavigation}/>
    {mobileNavOpen&&<button type="button" className="scrim open" aria-label="Fechar menu" onClick={closeMobileNavigation}/>}
    <div className="main-area" aria-hidden={mobileNavOpen?true:undefined}>
      <Header userName={userName} userAvatar={userAvatar} role={role} onLogout={onLogout} mobileNavOpen={mobileNavOpen} onMenuClick={()=>setMobileNavOpen(open=>!open)}/>
      <main className="main-content">{children}</main>
    </div>
  </div>;
}
