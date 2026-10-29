import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {useState} from 'react';
import {PhoneInput} from '../components/common/PhoneInput';
const Harness=({onChange=()=>{}}:{onChange?:(value:string)=>void})=>{const[value,setValue]=useState('');return <PhoneInput value={value} onChange={next=>{setValue(next);onChange(next)}}/>};

it('formats and validates a Brazilian mobile number while typing',async()=>{const user=userEvent.setup();const change=vi.fn();render(<Harness onChange={change}/>);expect(screen.getByRole('combobox',{name:'Código do país'})).toHaveTextContent('+55 · Brasil');expect(screen.getByRole('img',{name:'Bandeira do Brasil'})).toBeInTheDocument();const input=screen.getByRole('textbox',{name:'Telefone'});await user.type(input,'31999991234');expect(input).toHaveValue('(31) 99999-1234');expect(change).toHaveBeenLastCalledWith('+55 (31) 99999-1234');expect(input).toBeValid()});

it('rejects invalid Brazilian DDDs and mobile numbers that do not start with nine',async()=>{const user=userEvent.setup();render(<Harness/>);const input=screen.getByRole('textbox',{name:'Telefone'});await user.type(input,'00999991234');expect(input).toBeInvalid();expect(input).toHaveAttribute('aria-invalid','true');await user.clear(input);await user.type(input,'31888881234');expect(input).toBeInvalid();expect(screen.getByRole('alert')).toHaveTextContent(/DDD válido|começar com 9/i)});

it('limits Brazilian phone input to eleven digits and warns on overflow',async()=>{const user=userEvent.setup();render(<Harness/>);const input=screen.getByRole('textbox',{name:'Telefone'});await user.type(input,'319999912345');expect(input).toHaveValue('(31) 99999-1234');expect(screen.getByRole('alert')).toHaveTextContent(/somente 11 dígitos/i)});

it('allows selecting another country with flag and calling code',async()=>{const user=userEvent.setup();const change=vi.fn();render(<Harness onChange={change}/>);await user.click(screen.getByRole('combobox',{name:'Código do país'}));expect(screen.getByRole('img',{name:'Bandeira dos Estados Unidos'})).toBeInTheDocument();await user.click(screen.getByRole('option',{name:/Estados Unidos/}));await user.type(screen.getByRole('textbox',{name:'Telefone'}),'4155552671');expect(screen.getByRole('textbox',{name:'Telefone'})).toHaveValue('(415) 555-2671');expect(change).toHaveBeenLastCalledWith('+1 (415) 555-2671')});
