import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {LoginScreen} from '../components/auth/LoginScreen';

describe('LoginScreen password visibility',()=>{
  it('shows the password only while the eye button is pressed',()=>{
    render(<LoginScreen onLogin={vi.fn()} onRecover={vi.fn()}/>);

    const password=screen.getByLabelText('Senha');
    const reveal=screen.getByRole('button',{name:'Pressione e segure para mostrar a senha'});

    expect(password).toHaveAttribute('type','password');
    expect(reveal.querySelector('.lucide-eye-off')).toBeInTheDocument();

    fireEvent.pointerDown(reveal);
    expect(password).toHaveAttribute('type','text');
    expect(reveal.querySelector('.lucide-eye')).toBeInTheDocument();

    fireEvent.pointerUp(reveal);
    expect(password).toHaveAttribute('type','password');
    expect(reveal.querySelector('.lucide-eye-off')).toBeInTheDocument();
  });
});
