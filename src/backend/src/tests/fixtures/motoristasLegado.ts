/**
 * Dados sintéticos representativos do legado de `motoristas` (SCRUM-308). Nenhum número é real.
 * Cobrem: zeros à esquerda, separadores, colisão por representação equivalente, comprimento errado,
 * letras, dígitos repetidos, categoria fora da lista, CNH vencida, usuário nulo e usuário duplicado.
 */
export const motoristasLegado = [
  { id: 1, usuario_id: 10, numero_cnh: '01234567890', categoria_cnh: 'B', validade_cnh: '2030-12-31' },
  { id: 2, usuario_id: 11, numero_cnh: '012.345.678-90', categoria_cnh: 'AB', validade_cnh: '2029-05-10' },
  { id: 3, usuario_id: 12, numero_cnh: '00098765432', categoria_cnh: 'D', validade_cnh: '2020-01-31' },
  { id: 4, usuario_id: null, numero_cnh: '123456789', categoria_cnh: 'ACC', validade_cnh: '2031-07-01' },
  { id: 5, usuario_id: 30, numero_cnh: 'AB123456789', categoria_cnh: 'e', validade_cnh: '2032-03-15' },
  { id: 6, usuario_id: 30, numero_cnh: '55555555555', categoria_cnh: 'C', validade_cnh: '2032-03-15' },
  { id: 7, usuario_id: 31, numero_cnh: '10000000001', categoria_cnh: 'B', validade_cnh: '2030-12-31' },
];
