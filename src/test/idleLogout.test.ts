import {afterEach,describe,expect,it,vi} from 'vitest';
import {CRM_IDLE_TIMEOUT_MS,startIdleLogout} from '../lib/idleLogout';
describe('logout por inatividade',()=>{
 afterEach(()=>vi.useRealTimers());
 it('encerra após 20 minutos sem atividade',()=>{vi.useFakeTimers();const logout=vi.fn();const stop=startIdleLogout(logout);vi.advanceTimersByTime(CRM_IDLE_TIMEOUT_MS-1);expect(logout).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(logout).toHaveBeenCalledOnce();stop()});
 it('reinicia o prazo quando o usuário interage',()=>{vi.useFakeTimers();const logout=vi.fn();const stop=startIdleLogout(logout);vi.advanceTimersByTime(15*60*1000);window.dispatchEvent(new Event('pointerdown'));vi.advanceTimersByTime(10*60*1000);expect(logout).not.toHaveBeenCalled();vi.advanceTimersByTime(10*60*1000);expect(logout).toHaveBeenCalledOnce();stop()});
});
