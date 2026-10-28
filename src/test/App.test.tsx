import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('App sem sessão', () => {
  it('mostra a tela real de login sem dados empresariais fabricados', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Acesse sua operação' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByText('Receita total')).not.toBeInTheDocument();
  });

  it('não oferece modo de visualização na versão autenticada de staging', () => {
    render(<App />);
    expect(screen.queryByRole('button',{name:'Visualizar interface React'})).not.toBeInTheDocument();
  });
});
