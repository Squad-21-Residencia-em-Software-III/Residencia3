// Retângulo que contém Sergipe (mesmos limites de src/frontend/src/config/mapas.ts: LIMITES_SERGIPE).
// Serve só para a conferência conservadora de fora_area_cobertura: um ponto FORA do retângulo está
// certamente fora de Sergipe; um ponto dentro dele não prova que está em Sergipe (o retângulo cobre
// parte de estados vizinhos), então nesse caso vale o que o cidadão informou.
export const LIMITES_AREA_COBERTURA_SVO = {
  minLatitude: -11.6,
  maxLatitude: -9.5,
  minLongitude: -38.3,
  maxLongitude: -36.3,
} as const;

export function pontoForaDoRetanguloDeSergipe(latitude: number, longitude: number): boolean {
  const L = LIMITES_AREA_COBERTURA_SVO;
  return latitude < L.minLatitude || latitude > L.maxLatitude || longitude < L.minLongitude || longitude > L.maxLongitude;
}
