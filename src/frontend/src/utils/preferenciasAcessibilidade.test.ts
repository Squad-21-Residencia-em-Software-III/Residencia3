import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aplicarNoDocumento,
  carregarPreferencias,
  chaveDe,
  iguaisAoPadrao,
  normalizar,
  PREFERENCIAS_PADRAO,
  salvarPreferencias,
} from './preferenciasAcessibilidade';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('preferências de acessibilidade (SCRUM-305)', () => {
  it('sem nada salvo, usa o padrão', () => {
    expect(carregarPreferencias(null)).toEqual(PREFERENCIAS_PADRAO);
    expect(carregarPreferencias(7)).toEqual(PREFERENCIAS_PADRAO);
  });

  it('valor desconhecido volta ao padrão campo a campo, sem perder os válidos', () => {
    expect(normalizar({ escalaTexto: 3, contraste: 'alto', movimento: 'turbo', paleta: 'tritanopia' })).toEqual({
      ...PREFERENCIAS_PADRAO,
      contraste: 'alto',
      paleta: 'tritanopia',
    });
    expect(normalizar('lixo')).toEqual(PREFERENCIAS_PADRAO);
  });

  it('cada conta tem as suas; a conta nova parte das do visitante', () => {
    salvarPreferencias(null, { ...PREFERENCIAS_PADRAO, escalaTexto: 1.25 });
    salvarPreferencias(1, { ...PREFERENCIAS_PADRAO, contraste: 'alto' });

    expect(carregarPreferencias(1)).toEqual({ ...PREFERENCIAS_PADRAO, contraste: 'alto' });
    expect(carregarPreferencias(2)).toEqual({ ...PREFERENCIAS_PADRAO, escalaTexto: 1.25 });
    expect(carregarPreferencias(null)).toEqual({ ...PREFERENCIAS_PADRAO, escalaTexto: 1.25 });
  });

  it('ignora dado de outra versão ou corrompido', () => {
    localStorage.setItem(chaveDe(null), JSON.stringify({ v: 99, prefs: { contraste: 'alto' } }));
    expect(carregarPreferencias(null)).toEqual(PREFERENCIAS_PADRAO);
    localStorage.setItem(chaveDe(null), '{quebrado');
    expect(carregarPreferencias(null)).toEqual(PREFERENCIAS_PADRAO);
  });

  it('com o armazenamento bloqueado, segue funcionando com o padrão', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => salvarPreferencias(null, PREFERENCIAS_PADRAO)).not.toThrow();
    expect(carregarPreferencias(null)).toEqual(PREFERENCIAS_PADRAO);
  });

  it('aplica só atributos e a variável de escala no <html>', () => {
    const raiz = document.createElement('html');
    aplicarNoDocumento({ escalaTexto: 1.5, contraste: 'alto', movimento: 'reduzido', paleta: 'deuteranopia' }, raiz);
    expect(raiz.style.getPropertyValue('--escala-texto')).toBe('1.5');
    expect(raiz.dataset).toMatchObject({ contraste: 'alto', movimento: 'reduzido', paleta: 'deuteranopia' });
    expect(raiz.getAttribute('style')).not.toMatch(/filter/);
  });

  it('reconhece quando está tudo no padrão', () => {
    expect(iguaisAoPadrao({ ...PREFERENCIAS_PADRAO })).toBe(true);
    expect(iguaisAoPadrao({ ...PREFERENCIAS_PADRAO, movimento: 'reduzido' })).toBe(false);
  });
});
