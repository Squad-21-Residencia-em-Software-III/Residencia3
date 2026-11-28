// Caminho e export preservados para a migration 20261127140000_scrum_263_integridade_svo_externo.js.
const privilegios = require('./privilegiosSolicitacoesExternasSvo.cjs');

module.exports = {
  DADOS: privilegios.DADOS,
  CREDENCIAIS: privilegios.CREDENCIAIS,
  aplicarPrivilegiosScrum263: privilegios.aplicarPrivilegiosSolicitacoesExternasSvo,
};
