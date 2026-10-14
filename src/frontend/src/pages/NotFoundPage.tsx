import { Link } from 'react-router-dom'
import { PagePlaceholder } from './PagePlaceholder'

export default function NotFoundPage() {
  return (
    <>
      <PagePlaceholder title="Página não encontrada" />
      <p>
        <Link to="/dashboard">Voltar ao Dashboard</Link>
      </p>
    </>
  )
}
