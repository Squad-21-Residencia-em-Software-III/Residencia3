import { Card } from '../components/ui'

export function PagePlaceholder({ title }: { title: string }) {
  return (
    <Card style={{ padding: 24 }}>
      <h2>{title}</h2>
      <p>Esta página será implementada em uma próxima etapa.</p>
    </Card>
  )
}
