import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert } from './Alert';
import { Badge } from './Badge';
import { Input, Select, Textarea } from './Form';
import { TableFilterCollapse } from './Table';
import { MetricCard } from './MetricCard';
import userEvent from '@testing-library/user-event';

// SCRUM-306 e SCRUM-307: campos, alertas, selos de status e filtros recolhidos.

describe('campos de formulário', () => {
  it('erro e descrição ficam ligados ao campo e o marcam como inválido', () => {
    render(<Input label="Quilometragem" descricao="Só números." erro="Informe a quilometragem." />);
    const campo = screen.getByRole('textbox', { name: 'Quilometragem' });
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Só números. Informe a quilometragem.');
  });

  it('sem erro não marca inválido e preserva aria-describedby e aria-invalid de quem usa', () => {
    render(
      <>
        <p id="ajuda-externa">Ajuda externa</p>
        <Input label="Placa" aria-describedby="ajuda-externa" aria-invalid="true" />
      </>,
    );
    const campo = screen.getByRole('textbox', { name: 'Placa' });
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Ajuda externa');
  });

  it('select e textarea também recebem o erro', () => {
    render(
      <>
        <Select label="Veículo" erro="Escolha um veículo.">
          <option value="">Selecione</option>
        </Select>
        <Textarea label="Justificativa" erro="Obrigatória." />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Veículo' })).toHaveAccessibleDescription('Escolha um veículo.');
    expect(screen.getByRole('textbox', { name: 'Justificativa' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('campo sem rótulo visível também mostra e liga o erro', () => {
    render(<Input aria-label="Buscar" erro="Digite ao menos 3 letras." />);
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveAccessibleDescription('Digite ao menos 3 letras.');
  });
});

describe('Alert', () => {
  it('erro interrompe o leitor de tela; aviso, informação e sucesso esperam', () => {
    render(
      <>
        <Alert tone="danger">Falhou</Alert>
        <Alert tone="warning">Atenção</Alert>
        <Alert tone="info">Informação</Alert>
        <Alert tone="success">Salvo</Alert>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    expect(screen.getAllByRole('status').map((el) => el.textContent)).toEqual(['Atenção', 'Informação', 'Salvo']);
  });
});

describe('Badge', () => {
  it('cada tom tem uma forma própria, além da cor, escondida do leitor de tela', () => {
    const tons = ['success', 'danger', 'warning', 'info', 'purple', 'neutral'] as const;
    render(
      <>
        {tons.map((tom) => (
          <Badge key={tom} tone={tom}>
            {tom}
          </Badge>
        ))}
      </>,
    );
    const formas = tons.map((tom) => {
      const selo = screen.getByText(tom);
      const icone = selo.querySelector('svg');
      expect(icone).toHaveAttribute('aria-hidden', 'true');
      return icone?.getAttribute('class')?.match(/lucide-[a-z-]+/g)?.join(' ');
    });
    expect(new Set(formas).size).toBe(tons.length);
  });
});

describe('TableFilterCollapse', () => {
  it('recolhido, tira os filtros do Tab e dos leitores de tela', () => {
    const { rerender, container } = render(
      <TableFilterCollapse isOpen={false}>
        <input aria-label="Filtro" />
      </TableFilterCollapse>,
    );
    expect(container.querySelector('[inert]')).toContainElement(screen.getByLabelText('Filtro', { selector: 'input' }));
    rerender(
      <TableFilterCollapse isOpen>
        <input aria-label="Filtro" />
      </TableFilterCollapse>,
    );
    expect(container.querySelector('[inert]')).toBeNull();
  });
});

it('opera o filtro da métrica por teclado e anuncia o estado selecionado', async () => {
  const teclado = userEvent.setup();
  const alternar = vi.fn();
  const { rerender } = render(<MetricCard label="Disponíveis" value={3} isActive={false} onClick={alternar} />);
  const filtro = screen.getByRole('button', { name: /Disponíveis/, pressed: false });
  await teclado.tab();
  expect(filtro).toHaveFocus();
  await teclado.keyboard('{Enter}');
  expect(alternar).toHaveBeenCalledOnce();
  rerender(<MetricCard label="Disponíveis" value={3} isActive onClick={alternar} />);
  expect(screen.getByRole('button', { name: /Disponíveis/, pressed: true })).toHaveTextContent('Ativo');
});
