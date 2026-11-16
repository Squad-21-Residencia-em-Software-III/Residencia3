import { beforeEach, describe, expect, it } from 'vitest';
import { storageService } from './storageService';

describe('storageService: armazenamento apenas em memória', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storageService.clear();
  });

  it('retorna os dados da agenda sem gravar nada no localStorage ou sessionStorage', () => {
    const agenda = storageService.getAgenda();

    expect(agenda.hoje.length).toBeGreaterThan(0);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
