import type { RegistroAuditoria } from '../../types/auditoria'
import { request } from './http'

export const auditoriaApi = {
  /** Somente Administrador (o backend responde 403 aos demais perfis). */
  listar: () => request<RegistroAuditoria[]>('GET', '/auditorias'),
}
