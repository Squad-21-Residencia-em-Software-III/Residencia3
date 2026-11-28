import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './styles/acessibilidade.css';
import './styles/paletas.css';
import App from './App';
import { aplicarNoDocumento, carregarPreferencias } from './utils/preferenciasAcessibilidade';

// Antes do primeiro desenho, para a tela não piscar no tamanho e nas cores padrão (SCRUM-305)
aplicarNoDocumento(carregarPreferencias(null));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
