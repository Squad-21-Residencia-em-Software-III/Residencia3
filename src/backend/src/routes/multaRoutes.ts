import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { multaController } from '../controllers/multaController';
import { autenticar } from '../middlewares/autenticar';
import { autorizar } from '../middlewares/autorizar';
import { restringirFrotaAdministrativa } from '../middlewares/restringirFrotaAdministrativa';

export const multaRoutes = Router();

multaRoutes.use(autenticar);
multaRoutes.use(autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA));

multaRoutes.get('/', multaController.listar);
multaRoutes.post('/', restringirFrotaAdministrativa('veiculo-body'), multaController.criar);
multaRoutes.put('/:id', restringirFrotaAdministrativa('multa'), multaController.atualizar);
multaRoutes.delete('/:id', restringirFrotaAdministrativa('multa'), multaController.excluir);
