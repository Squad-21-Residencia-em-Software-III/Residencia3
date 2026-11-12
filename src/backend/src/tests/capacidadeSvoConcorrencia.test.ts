import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../constants/perfis';

// Banco em memória compartilhado pelas transações. `FOR UPDATE` em `veiculos` bloqueia a
// linha até o fim da transação, como no PostgreSQL, permitindo reproduzir a edição da
// capacidade e a alocação SVO concorrendo pelo mesmo veículo.
type Linha = Record<string, any>;
type Filtro = (linha: Linha) => boolean;

const { banco } = vi.hoisted(() => {
  const banco = {
    tabelas: {} as Record<string, Linha[]>,
    eventos: [] as string[],
    travas: new Map<number, Promise<void>>(),
    proximoId: 100,
    transacoes: 0,
    reiniciar() {
      banco.tabelas = {};
      banco.eventos = [];
      banco.travas = new Map();
      banco.proximoId = 100;
      banco.transacoes = 0;
    },
  };
  return { banco };
});

vi.mock('../config/database', () => {
  type Tabelas = Record<string, Linha[]>;
  const clonar = (tabelas: Tabelas): Tabelas =>
    Object.fromEntries(Object.entries(tabelas).map(([nome, linhas]) => [nome, linhas.map((l) => ({ ...l }))]));

  function criarTransacao(emTransacao = true) {
    const nome = emTransacao ? `trx${++banco.transacoes}` : 'fora-da-transacao';
    const liberacoes: (() => void)[] = [];
    // Escritas ficam pendentes e só são aplicadas no commit (isolamento READ COMMITTED)
    const pendentes: ((tabelas: Tabelas) => void)[] = [];
    const travadas = new Set<number>();

    // O que esta transação enxerga: dados já confirmados + as próprias escritas
    const vista = () => {
      const tabelas = clonar(banco.tabelas);
      pendentes.forEach((aplicar) => aplicar(tabelas));
      return tabelas;
    };

    async function travar(id: number) {
      if (!emTransacao || travadas.has(id)) return;
      travadas.add(id);
      // Fila por linha: espera a transação anterior terminar
      const anterior = banco.travas.get(id) ?? Promise.resolve();
      let liberar!: () => void;
      const atual = new Promise<void>((resolve) => (liberar = resolve));
      banco.travas.set(id, anterior.then(() => atual));
      await anterior;
      banco.eventos.push(`${nome}:travou veiculo ${id}`);
      liberacoes.push(liberar);
    }

    const trx = Object.assign(
      (tabela: string) => {
        const filtros: Filtro[] = [];
        let paraAtualizar = false;
        let operacao: { tipo: 'insert' | 'update'; valores: Linha } | undefined;
        let terminal: (linhas: Linha[]) => unknown = (linhas) => linhas;

        const filtrar = (linhas: Linha[] = []) => linhas.filter((l) => filtros.every((f) => f(l)));

        async function executar() {
          // SELECT ... FOR UPDATE e UPDATE em veículos esperam a trava da linha, como no PostgreSQL
          if (tabela === 'veiculos' && (paraAtualizar || operacao?.tipo === 'update')) {
            for (const linha of filtrar(vista()[tabela])) await travar(linha.id);
          }

          if (operacao?.tipo === 'insert') {
            const linha = { id: banco.proximoId++, ...operacao.valores };
            pendentes.push((tabelas) => (tabelas[tabela] ??= []).push({ ...linha }));
            banco.eventos.push(`${nome}:insert ${tabela}`);
            return [linha];
          }
          if (operacao?.tipo === 'update') {
            const valores = operacao.valores;
            const ids = filtrar(vista()[tabela]).map((l) => l.id);
            pendentes.push((tabelas) =>
              (tabelas[tabela] ?? []).filter((l) => ids.includes(l.id)).forEach((l) => Object.assign(l, valores))
            );
            banco.eventos.push(`${nome}:update ${tabela}`);
            return filtrar(vista()[tabela]).filter((l) => ids.includes(l.id));
          }
          return terminal(filtrar(vista()[tabela]));
        }

        const consulta: Linha = {
          where(coluna: string | Linha, operador?: string, valor?: unknown) {
            if (typeof coluna === 'object') {
              filtros.push((l) => Object.entries(coluna).every(([c, v]) => l[c] === v));
            } else if (operador === '>=') {
              filtros.push((l) => l[coluna] >= (valor as string));
            } else {
              filtros.push((l) => l[coluna] === operador);
            }
            return consulta;
          },
          whereIn(coluna: string, valores: unknown[]) {
            filtros.push((l) => valores.includes(l[coluna]));
            return consulta;
          },
          whereNot(criterio: Linha) {
            filtros.push((l) => !Object.entries(criterio).every(([c, v]) => l[c] === v));
            return consulta;
          },
          forUpdate() {
            paraAtualizar = true;
            return consulta;
          },
          select() {
            return consulta;
          },
          insert(valores: Linha) {
            operacao = { tipo: 'insert', valores };
            return consulta;
          },
          update(valores: Linha) {
            operacao = { tipo: 'update', valores };
            return consulta;
          },
          returning() {
            return consulta;
          },
          sum(alias: Record<string, string>) {
            const [[nomeAlias, coluna]] = Object.entries(alias);
            banco.eventos.push(`${nome}:soma ${tabela}`);
            terminal = (resultado) => [
              { [nomeAlias]: resultado.length ? resultado.reduce((t, l) => t + l[coluna], 0) : null },
            ];
            return consulta;
          },
          first() {
            terminal = (resultado) => resultado[0];
            return executar();
          },
          then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
            return executar().then(resolve, reject);
          },
        };
        return consulta;
      },
      {
        // Situação do recurso (bool_or) a partir das ordens SVO visíveis na transação
        raw: async (sql: string, [id]: number[]) => {
          const coluna = sql.includes('motorista_id = ?') ? 'motorista_id' : 'veiculo_id';
          const status = (vista().ordens_svo ?? []).filter((o) => o[coluna] === id).map((o) => o.status);
          return {
            rows: [
              {
                em_andamento: status.some((s) => ['EM_ANDAMENTO', 'EM_DESLOCAMENTO'].includes(s)),
                agendada: status.some((s) => ['AGENDADA', 'ALOCADA'].includes(s)),
              },
            ],
          };
        },
      }
    );

    const confirmar = () => pendentes.forEach((aplicar) => aplicar(banco.tabelas));
    return { trx, liberacoes, confirmar };
  }

  // Consulta fora de transação: lê só o que já foi confirmado, sem trava
  const consultaAvulsa = (tabela: string) => criarTransacao(false).trx(tabela);

  return {
    db: Object.assign(consultaAvulsa, {
      async transaction(callback: (trx: unknown) => Promise<unknown>) {
        const { trx, liberacoes, confirmar } = criarTransacao();
        try {
          const resultado = await callback(trx);
          confirmar();
          return resultado;
        } finally {
          // Em erro nada é confirmado (rollback); a trava é liberada nos dois casos
          liberacoes.forEach((liberar) => liberar());
        }
      },
    }),
  };
});

// Pontos de pausa: seguram uma transação (com a trava) antes do commit
const { pausas } = vi.hoisted(() => ({
  pausas: { alocacao: undefined as Promise<void> | undefined, edicao: undefined as Promise<void> | undefined },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: {
    registrar: vi.fn(async (registro: { modulo: string }) => {
      if (registro.modulo === 'VEICULOS') await pausas.edicao;
    }),
  },
  MODULOS_AUDITORIA: { VIAGENS: 'VIAGENS', VEICULOS: 'VEICULOS' },
}));

vi.mock('../models/viagemModel', () => ({
  viagemModel: {
    buscarPorId: vi.fn(async (tipo: string, id: number) => {
      await pausas.alocacao;
      return { id, tipo_operacao: tipo };
    }),
  },
}));

import { veiculoService } from '../services/veiculoService';
import { viagemService } from '../services/viagemService';

const gestorSvo = { id: 4, perfil: PERFIS.GESTOR_SVO };

function pausa() {
  let liberar!: () => void;
  const promessa = new Promise<void>((resolve) => (liberar = resolve));
  return { promessa, liberar };
}

// Deixa as outras requisições avançarem até onde conseguirem
const darVez = () => new Promise((resolve) => setTimeout(resolve, 20));

const ocupacao = () =>
  banco.tabelas.ordens_svo
    .filter((o) => o.veiculo_id === 10 && ['ALOCADA', 'EM_DESLOCAMENTO'].includes(o.status))
    .reduce((total, o) => total + o.capacidade_utilizada, 0);

const capacidade = () => banco.tabelas.veiculos.find((v) => v.id === 10)!.capacidade_maxima;

const novaAlocacao = () =>
  viagemService.criar(
    {
      tipo_operacao: 'SVO',
      solicitacao_id: 8,
      veiculo_id: 10,
      motorista_id: 20,
      equipe_id: null,
      capacidade_utilizada: 2,
    },
    gestorSvo
  );

beforeEach(() => {
  banco.reiniciar();
  pausas.alocacao = undefined;
  pausas.edicao = undefined;

  banco.tabelas = {
    veiculos: [
      {
        id: 10,
        placa: 'SVO1A23',
        modelo: 'Rabecão',
        tipo_frota: 'SVO',
        capacidade_maxima: 4,
        km_atual: 1000,
        status: 'RESERVADO',
      },
    ],
    motoristas: [{ id: 20, tipo_motorista: 'SVO', status: 'DESIGNADO', validade_cnh: '2099-12-31' }],
    solicitacoes_svo: [
      { id: 7, status: 'EM_ANDAMENTO' },
      { id: 8, status: 'EM_TRIAGEM' },
    ],
    // 2 das 4 vagas já ocupadas
    ordens_svo: [
      { id: 1, solicitacao_id: 7, veiculo_id: 10, motorista_id: 20, capacidade_utilizada: 2, status: 'ALOCADA' },
    ],
    equipes_svo: [],
    viagens_frota: [],
  };
});

describe('Concorrência entre edição da capacidade e alocação SVO (BL30)', () => {
  it('a edição espera a alocação em andamento e valida com a ocupação já confirmada', async () => {
    const { promessa, liberar } = pausa();
    pausas.alocacao = promessa;

    // 1. A alocação (+2 vagas) trava o veículo e fica parada antes do commit
    const alocacao = novaAlocacao();
    await darVez();

    // 2. Ao mesmo tempo, a edição tenta reduzir a capacidade para 2
    const edicao = veiculoService.atualizar(10, { capacidade_maxima: 2 }, 1);
    const resultadoEdicao = edicao.catch((erro) => erro);
    await darVez();

    // A edição (trx2) está bloqueada na trava: não leu a ocupação nem gravou nada
    expect(banco.eventos).toEqual(['trx1:travou veiculo 10', 'trx1:insert ordens_svo', 'trx1:update veiculos', 'trx1:update motoristas', 'trx1:update solicitacoes_svo']);
    expect(capacidade()).toBe(4);

    // 3. A alocação termina; a edição prossegue com o estado atual (4 vagas ocupadas)
    liberar();
    await expect(alocacao).resolves.toMatchObject({ tipo_operacao: 'SVO' });
    await expect(resultadoEdicao).resolves.toMatchObject({
      statusCode: 409,
      message: 'A capacidade não pode ser menor que a ocupação atual do veículo (4)',
    });

    expect(capacidade()).toBe(4);
    expect(ocupacao()).toBe(4);
    expect(ocupacao()).toBeLessThanOrEqual(capacidade());
  });

  it('a alocação espera a edição em andamento e respeita a nova capacidade', async () => {
    const { promessa, liberar } = pausa();
    pausas.edicao = promessa;

    // 1. A edição reduz a capacidade para 2 e fica parada antes do commit
    const edicao = veiculoService.atualizar(10, { capacidade_maxima: 2 }, 1);
    await darVez();

    // 2. Ao mesmo tempo, chega uma alocação de +2 vagas
    const alocacao = novaAlocacao().catch((erro) => erro);
    await darVez();

    // A alocação (trx2) está bloqueada na trava do veículo: nenhuma ordem foi criada
    expect(banco.eventos).toEqual(['trx1:travou veiculo 10', 'trx1:soma ordens_svo', 'trx1:update veiculos']);
    expect(banco.tabelas.ordens_svo).toHaveLength(1);

    // 3. A edição termina; a alocação vê capacidade 2 com 2 vagas já ocupadas
    liberar();
    await expect(edicao).resolves.toMatchObject({ capacidade_maxima: 2 });
    await expect(alocacao).resolves.toMatchObject({
      statusCode: 409,
      message: 'O veículo não tem capacidade suficiente (vagas disponíveis: 0)',
    });

    expect(capacidade()).toBe(2);
    expect(ocupacao()).toBe(2);
    expect(ocupacao()).toBeLessThanOrEqual(capacidade());
  });

  it('uma edição não pode se basear em leitura feita antes de outra edição terminar', async () => {
    // Capacidade 2, com as 2 vagas ocupadas
    banco.tabelas.veiculos[0].capacidade_maxima = 2;

    const { promessa, liberar } = pausa();
    pausas.edicao = promessa;

    // 1. Edição A aumenta a capacidade para 4 e fica parada com a trava
    const edicaoA = veiculoService.atualizar(10, { capacidade_maxima: 4 }, 1);
    await darVez();

    // 2. Chega uma alocação de +2 (contando com a capacidade 4) e entra na fila
    const alocacao = novaAlocacao();
    await darVez();

    // 3. Edição B, de quem ainda vê a capacidade 2, reenvia capacidade 2 e entra na fila
    const edicaoB = veiculoService.atualizar(10, { capacidade_maxima: 2 }, 1).catch((erro) => erro);
    await darVez();

    // 4. Libera: A confirma 4, a alocação ocupa as 4 vagas e B precisa ver isso
    liberar();
    await expect(edicaoA).resolves.toMatchObject({ capacidade_maxima: 4 });
    await expect(alocacao).resolves.toMatchObject({ tipo_operacao: 'SVO' });
    await expect(edicaoB).resolves.toMatchObject({
      statusCode: 409,
      message: 'A capacidade não pode ser menor que a ocupação atual do veículo (4)',
    });

    expect(ocupacao()).toBe(4);
    expect(capacidade()).toBe(4);
    expect(ocupacao()).toBeLessThanOrEqual(capacidade());
  });
});
