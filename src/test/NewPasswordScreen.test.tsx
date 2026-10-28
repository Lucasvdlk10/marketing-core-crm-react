import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,expect,it,vi} from 'vitest';
import {NewPasswordScreen} from '../components/auth/NewPasswordScreen';

describe('NewPasswordScreen',()=>{
  it('valida a confirmação e envia a nova senha',async()=>{
    const user=userEvent.setup();const onSubmit=vi.fn().mockResolvedValue(undefined);
    render(<NewPasswordScreen onSubmit={onSubmit}/>);
    await user.type(screen.getByLabelText('Nova senha'),'senha-segura-123');
    await user.type(screen.getByLabelText('Confirmar nova senha'),'outra-senha-123');
    await user.click(screen.getByRole('button',{name:'Salvar nova senha'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não coincidem.');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Confirmar nova senha'));
    await user.type(screen.getByLabelText('Confirmar nova senha'),'senha-segura-123');
    await user.click(screen.getByRole('button',{name:'Salvar nova senha'}));
    expect(onSubmit).toHaveBeenCalledWith('senha-segura-123');
  });
});
