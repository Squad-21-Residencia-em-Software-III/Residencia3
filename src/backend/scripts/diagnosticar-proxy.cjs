const { isIP } = require('node:net');

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice === -1 ? undefined : process.argv[indice + 1];
}

function origem(nome) {
  const url = new URL(argumento(nome));
  if (url.protocol !== 'https:' || url.username || url.password || url.href !== `${url.origin}/`) {
    throw new Error('Informe duas origens HTTPS, sem credenciais, caminho, query ou fragmento.');
  }
  return url.origin;
}

async function diagnosticar(base, token, caminho) {
  const resposta = await fetch(`${base}/api/diagnostico/ip`, {
    headers: { 'X-Diagnostico-Token': token },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!resposta.ok) throw new Error(`Diagnóstico ${caminho} respondeu HTTP ${resposta.status}.`);
  const dados = await resposta.json();
  if (dados.caminho !== caminho || typeof dados.clienteIdentificado !== 'string' || !isIP(dados.clienteIdentificado)) {
    throw new Error(`Diagnóstico ${caminho} retornou identificação inválida.`);
  }
  return dados.clienteIdentificado;
}

async function main() {
  const token = process.env.DIAGNOSTICO_PROXY_TOKEN;
  if (!token || !argumento('direto') || !argumento('vercel')) {
    console.error('Defina DIAGNOSTICO_PROXY_TOKEN e informe --direto e --vercel.');
    process.exitCode = 2;
    return;
  }

  const direto = origem('direto');
  const vercel = origem('vercel');
  console.log(`Destinos do diagnóstico: ${direto} e ${vercel}`);
  const ipDireto = await diagnosticar(direto, token, 'direto');
  const ipVercel = await diagnosticar(vercel, token, 'vercel');
  if (ipDireto !== ipVercel) throw new Error('Os caminhos retornaram endereços diferentes.');
  console.log(`Identificação consistente nos dois caminhos (IPv${isIP(ipDireto)}).`);
}

main().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
