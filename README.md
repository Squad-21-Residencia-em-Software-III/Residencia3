# Sistema de Gestão de Frota e Transportes (FMS/TMS)

## 📌 Sobre o Projeto
Sistema web responsivo que será desenvolvido para otimizar o fluxo de solicitações, aprovações e agendamentos de veículos operacionais da Fundação Parreira Horta. O objetivo central é substituir controles informais na gestão da frota, eliminar viagens redundantes, maximizar a ocupação dos veículos por uma única plataforma digital consolidada.

## ⚠️ O Problema
Atualmente, o controle insuficiente das solicitações gera viagens subutilizadas, sobrecarga na agenda e falta de visibilidade em tempo real sobre condutores e veículos. A operação envolve áreas de conectividade variável (interior) e especificidades complexas (como transporte de pacientes, equipes de coleta e corpos), exigindo uma solução adaptável, unificada e escalável.

## 🚀 Funcionalidades Principais (MVP)
* **Solicitação e Aprovação:** Fluxo para colaboradores solicitarem veículos diretamente pelo sistema, com aprovação gerencial.
* **Agendamento Inteligente:** Agenda consolidada da frota para evitar viagens redundantes e possibilitar a agregação de passageiros no mesmo trajeto.
* **Gestão de Viagens:** Registro obrigatório de veículo (modelo, capacidade, especificidade) e condutor para cada saída.
* **Acessibilidade Universal:** Aplicação estruturada como PWA, permitindo acesso em dispositivos móveis e desktops, com preparação estrutural para áreas com baixa cobertura de internet.

## 🛠️ Stack Tecnológica
* **Ecossistema Base:** TypeScript (End-to-End)
* **Frontend:** React (TS).
* **Backend:** Node.js (TS) gerenciando a lógica de negócios, integrações e API.
* **Banco de Dados:** PostgreSQL.
* **Infraestrutura Inicial:** Hospedagem em provedores de nuvem voltados a MVP, mantendo a arquitetura desacoplada para escalabilidade.

## 🏗️ Decisões Arquiteturais em Aberto (Work in Progress)
O projeto encontra-se na fase de desenho da arquitetura técnica. Atualmente, a equipe avalia as melhores abordagens para os seguintes pilares:
* **Estratégia Offline:** Escolha do mecanismo de cache e banco local (Service Workers com IndexedDB vs. bancos locais reativos) para operação no interior.
* **Geolocalização:** Definição do provedor de mapas (Google Maps Platform, Mapbox ou OSRM) para roteirização e otimização.
* **Autenticação e Perfis:** Estratégia de gestão de usuários (implementação própria em Node.js com JWT vs. BaaS como Supabase/Firebase).
* Integração automatizada de solicitações via WhatsApp.
