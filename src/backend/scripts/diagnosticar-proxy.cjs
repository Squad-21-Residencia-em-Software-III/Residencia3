// Valida a identificação do IP real do cliente e o rate limit nos dois caminhos de acesso
// (docs/seguranca-http.md#decisão-e-validação):
//
//   direto: cliente → borda do Render → API
//   vercel: cliente → rewrite /api da Vercel → borda do Render → API
//
// Pré-requisito: DIAGNOSTICO_PROXY_TOKEN definido no Render (liga /api/diagnostico/ip).
//
// Uso:
//   DIAGNOSTICO_PROXY_TOKEN=... node scripts/diagnosticar-proxy.cjs \
//     --direto https://fsph-api.onrender.com --vercel https://fsph-web.vercel.app --rede wifi [--ip <seu IP público>]
//
// Rode uma vez em cada rede (ex.: --rede wifi e --rede 4g). O teste de rate limit consome as 10
// falhas de login da janela de 15 minutos do seu IP, e cada falha gera um registro de auditoria
// LOGIN_FALHOU (USUARIO_NAO_ENCONTRADO) com e-mail inexistente.
// Use --sem-rate-limit para só coletar os cabeçalhos.
//
// O resultado vai para docs/evidencias/proxy-<data>-<rede>.json, com o último bloco dos IPs mascarado.

const fs = require('node:fs');
const path = require('node:path');

const FORJADO = '6.6.6.6';
const FORJADO_2 = '7.7.7.7';
const EMAIL_INEXISTENTE = 'diagnostico-proxy@invalido.example';
const MAXIMO_TENTATIVAS_LOGIN = 12; // o limite de login é 10 falhas; a 11ª deve receber 429

function argumentos() {
  const lista = process.argv.slice(2);
  const valor = (nome) => {
    const i = lista.indexOf(`--${nome}`);
    return i >= 0 ? lista[i + 1] : undefined;
  };
  const direto = valor('direto');
  const vercel = valor('vercel');
  const rede = valor('rede') ?? 'rede';
  if (!direto || !vercel) {
    console.error('Informe --direto <url do Render> e --vercel <url do frontend>.');
    process.exit(2);
  }
  if (!/^[\w-]{1,30}$/.test(rede)) {
    console.error('--rede deve ter só letras, números, _ ou - (até 30 caracteres).');
    process.exit(2);
  }
  return { direto: direto.replace(/\/$/, ''), vercel: vercel.replace(/\/$/, ''), rede, rateLimit: !lista.includes('--sem-rate-limit') };
}

// Mascara o último bloco de IPv4/IPv6 para não publicar o IP do testador
function mascarar(valor) {
  if (typeof valor === 'string') {
    return valor
      .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, (ip, prefixo) => ([FORJADO, FORJADO_2].includes(ip) ? ip : `${prefixo}.x`))
      .replace(/\b([0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,6}):[0-9a-f]{1,4}\b/gi, '$1:x');
  }
  if (Array.isArray(valor)) return valor.map(mascarar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, mascarar(v)]));
  return valor;
}

async function diagnostico(base, token, extras = {}) {
  const res = await fetch(`${base}/api/diagnostico/ip`, { headers: { 'X-Diagnostico-Token': token, ...extras } });
  const corpo = await res.json().catch(() => null);
  return { status: res.status, corpo };
}

async function tentarLogin(base, origem, extras = {}) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origem, ...extras },
    body: JSON.stringify({ email: EMAIL_INEXISTENTE, senha: 'senha-invalida-diagnostico' }),
  });
  await res.arrayBuffer();
  return { status: res.status, rateLimit: res.headers.get('ratelimit'), politica: res.headers.get('ratelimit-policy') };
}

async function testarRateLimit(base, origem) {
  const tentativas = [];
  for (let i = 0; i < MAXIMO_TENTATIVAS_LOGIN; i += 1) {
    const t = await tentarLogin(base, origem);
    tentativas.push(t);
    if (t.status === 429) break;
  }
  const bloqueou = tentativas.some((t) => t.status === 429);
  // Depois do bloqueio, trocar o X-Forwarded-For forjado não pode liberar novas tentativas
  const comForjado = bloqueou ? await tentarLogin(base, origem, { 'X-Forwarded-For': FORJADO_2 }) : null;
  return {
    tentativas,
    bloqueouNaTentativa: bloqueou ? tentativas.findIndex((t) => t.status === 429) + 1 : null,
    comXffForjadoAposBloqueio: comForjado,
    forjadoNaoLiberou: comForjado ? comForjado.status === 429 : null,
  };
}

async function caminho(nome, base, origem, token, rateLimit) {
  const normal = await diagnostico(base, token);
  const forjado = await diagnostico(base, token, { 'X-Forwarded-For': FORJADO });
  // Tentativa de se passar pela Vercel no caminho direto
  const segredoFalso = await diagnostico(base, token, { 'X-Proxy-Secret': 'segredo-falso-do-diagnostico-000000' });
  const ip = normal.corpo?.clienteIdentificado ?? null;
  const resultado = {
    caminho: nome,
    base,
    normal,
    comXffForjado: forjado,
    comSegredoFalso: segredoFalso,
    verificacoes: {
      caminhoDetectado: normal.corpo?.caminho ?? null,
      forjadoIgnorado: forjado.corpo ? forjado.corpo.clienteIdentificado === ip && ip !== FORJADO : null,
      // No direto, o segredo falso não muda nada; na Vercel, o "set" do vercel.json o substitui pelo real
      segredoFalsoIgnorado: segredoFalso.corpo
        ? segredoFalso.corpo.clienteIdentificado === ip && segredoFalso.corpo.caminho === nome
        : null,
    },
  };
  if (rateLimit) resultado.rateLimit = await testarRateLimit(base, origem);
  return { resultado, ip };
}

async function main() {
  const { direto, vercel, rede, rateLimit } = argumentos();
  const token = process.env.DIAGNOSTICO_PROXY_TOKEN;
  if (!token) {
    console.error('Defina DIAGNOSTICO_PROXY_TOKEN com o mesmo valor configurado no Render.');
    process.exit(2);
  }
  // --ip informa o IP público manualmente (ex.: se a rede usa IPv6); sem ele, consulta o ipify
  const ipInformado = process.argv.includes('--ip') ? process.argv[process.argv.indexOf('--ip') + 1] : undefined;
  const ipPublico = ipInformado ?? (await fetch('https://api.ipify.org').then((r) => r.text()).catch(() => null));
  const origem = new URL(vercel).origin;

  const d = await caminho('direto', direto, origem, token, rateLimit);
  const v = await caminho('vercel', vercel, origem, token, rateLimit);

  const relatorio = {
    geradoEm: new Date().toISOString(),
    rede,
    ipPublicoDoTestador: ipPublico,
    resumo: {
      diretoIdentificaTestador: ipPublico ? d.ip === ipPublico : null,
      vercelIdentificaTestador: ipPublico ? v.ip === ipPublico : null,
      caminhoVercelAutenticado: v.resultado.verificacoes.caminhoDetectado === 'vercel',
      caminhoDiretoNaoAutenticado: d.resultado.verificacoes.caminhoDetectado === 'direto',
      forjadoIgnoradoNosDois: Boolean(d.resultado.verificacoes.forjadoIgnorado && v.resultado.verificacoes.forjadoIgnorado),
      segredoFalsoIgnoradoNosDois: Boolean(
        d.resultado.verificacoes.segredoFalsoIgnorado && v.resultado.verificacoes.segredoFalsoIgnorado
      ),
      ...(rateLimit
        ? {
            // Um IP novo (outra rede) começa com o próprio contador, sem herdar o de outros clientes
            diretoComecouLiberado: d.resultado.rateLimit.tentativas[0].status !== 429,
            diretoBloqueouNaTentativa11: d.resultado.rateLimit.bloqueouNaTentativa === 11,
            forjadoNaoLiberouNoDireto: d.resultado.rateLimit.forjadoNaoLiberou,
            // Já bloqueado pelo direto: prova que a Vercel conta pelo IP do testador, e não pelo da Vercel
            vercelHerdouBloqueioDoMesmoCliente: v.resultado.rateLimit.bloqueouNaTentativa === 1,
            forjadoNaoLiberouNaVercel: v.resultado.rateLimit.forjadoNaoLiberou,
          }
        : {}),
    },
    caminhos: [d.resultado, v.resultado],
  };

  const destino = path.resolve(__dirname, '../../../docs/evidencias');
  fs.mkdirSync(destino, { recursive: true });
  const arquivo = path.join(destino, `proxy-${relatorio.geradoEm.slice(0, 10)}-${rede}.json`);
  fs.writeFileSync(arquivo, `${JSON.stringify(mascarar(relatorio), null, 2)}\n`);

  console.log(JSON.stringify(mascarar(relatorio.resumo), null, 2));
  console.log(`Evidência salva em ${arquivo}`);
  const falhou = Object.values(relatorio.resumo).some((v) => v === false);
  process.exit(falhou ? 1 : 0);
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
