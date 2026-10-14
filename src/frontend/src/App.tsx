import { useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  IdBadge,
  Input,
  Modal,
  Pagination,
  Select,
  Table,
  TableToolbar,
} from './components/ui'
import type { BadgeTone } from './components/ui'

// Página provisória para visualizar o design system. Será substituída pelo layout e rotas (passo 3).

const viagens: { id: string; rota: string; motorista: string; status: string; tone: BadgeTone }[] = [
  { id: 'VIA-0881', rota: 'São Paulo → Campinas', motorista: 'Carlos Mendes', status: 'Concluída', tone: 'neutral' },
  { id: 'VIA-0882', rota: 'Santos → São Paulo', motorista: 'Roberto Souza', status: 'Em andamento', tone: 'info' },
  { id: 'VIA-0886', rota: 'Jundiaí → Guarulhos', motorista: 'Fernanda Lima', status: 'Agendada', tone: 'purple' },
  { id: 'VIA-0890', rota: 'Sorocaba → Santos', motorista: 'Ana Paula Silva', status: 'Pendente', tone: 'warning' },
]

export default function App() {
  const [open, setOpen] = useState(false)

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 32, display: 'grid', gap: 24 }}>
      <h1>Design system — FSPH</h1>

      <Card style={{ padding: 24, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button>Primário</Button>
        <Button variant="outline">Contorno</Button>
        <Button variant="ghost">Fantasma</Button>
        <Badge tone="success">Ativo</Badge>
        <Badge tone="warning">Licença</Badge>
        <Badge tone="info">Em viagem</Badge>
        <Badge tone="danger">Manutenção</Badge>
        <Badge tone="purple">Agendada</Badge>
        <Avatar name="Carlos Mendes" />
        <Avatar name="Fernanda Lima" size={36} />
      </Card>

      <Card>
        <TableToolbar title="Viagens" subtitle="Exemplo com dados fixos" newLabel="Nova viagem" onNew={() => setOpen(true)} />
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Rota</th>
              <th>Motorista</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {viagens.map((v) => (
              <tr key={v.id}>
                <td>
                  <IdBadge id={v.id} />
                </td>
                <td>{v.rota}</td>
                <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Avatar name={v.motorista} /> {v.motorista}
                </td>
                <td>
                  <Badge tone={v.tone}>{v.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination showing="1–4" total={4} />
      </Card>

      {open && (
        <Modal title="Nova viagem" confirmLabel="Criar viagem" onClose={() => setOpen(false)}>
          <Input label="Origem" placeholder="Ex.: Aracaju" />
          <Select label="Motorista" defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            <option>Carlos Mendes</option>
            <option>Fernanda Lima</option>
          </Select>
        </Modal>
      )}
    </main>
  )
}
