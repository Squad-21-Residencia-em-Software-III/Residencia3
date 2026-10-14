# Documentação do Squad 21

**Sistema de Gestão de Frota com Módulo de Verificação de Óbito**

**Versão 1.0** · Autor: SQUAD 21 · Aracaju/SE – 2026

## Índice

- [Prefácio](#prefácio)
- [Introdução ao Documento](#introdução-ao-documento)
  - [Tema](#tema)
  - [Objetivo do Projeto](#objetivo-do-projeto)
  - [Delimitação do Problema](#delimitação-do-problema)
  - [Justificativa da Escolha do Tema](#justificativa-da-escolha-do-tema)
  - [Método de Trabalho](#método-de-trabalho)
  - [Organização do Trabalho](#organização-do-trabalho)
  - [Glossário](#glossário)
- [Descrição Geral do Sistema](#descrição-geral-do-sistema)
  - [Descrição do Problema](#descrição-do-problema)
  - [Principais Envolvidos e suas Características](#principais-envolvidos-e-suas-características)
  - [Regras de Negócio](#regras-de-negócio)
- [Requisitos do Sistema](#requisitos-do-sistema)
  - [Requisitos Funcionais](#requisitos-funcionais)
  - [Requisitos Não-Funcionais](#requisitos-não-funcionais)
  - [Protótipo](#protótipo)
  - [Diagrama de Classes](#diagrama-de-classes)
  - [Modelo de Dados](#modelo-de-dados)
  - [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
- [Conclusões e Considerações Finais](#conclusões-e-considerações-finais)
  - [5.1. Síntese do trabalho](#51-síntese-do-trabalho)
  - [5.2. Aplicabilidade e limitações](#52-aplicabilidade-e-limitações)
  - [5.3. Continuidade do projeto](#53-continuidade-do-projeto)

## Prefácio

Esta documentação apresenta a visão funcional e técnica do Sistema de Gestão de Frota com Módulo de Verificação de Óbito, considerando como fonte principal o Documento de Visão do Produto(DVP). A solução foi pensada para centralizar informações da frota administrativa e da frota dedicada ao Serviço de Verificação de Óbito, reunindo cadastros, viagens, manutenção, abastecimento, documentação, multas e atendimento de solicitações de óbito em uma única plataforma.

O documento também registra decisões e necessidades discutidas pela equipe em aula, principalmente sobre a solicitação de viagens, a confirmação da rota pelo motorista, o controle de capacidade, a parametrização de escalas, a necessidade de uso em celulares e tablets e a possibilidade de notificações. Quando uma ideia aparece apenas como sugestão ou direção para evolução, ela é apresentada dessa forma e não como funcionalidade obrigatória da primeira versão.

A organização dos capítulos segue a estrutura dos modelos de documentação fornecidos, enquanto o conteúdo foi desenvolvido com base nas fontes específicas do projeto. Os diagramas que ainda não existem são descritos como artefatos a produzir, evitando apresentar como pronto algo que ainda está em definição.

## Introdução ao Documento

O objetivo deste capítulo é apresentar o projeto. Para tal, deve-se desenvolver um texto, com as seguintes características: impessoalidade, objetividade, clareza, precisão, coerência e concisão. A introdução deve abranger os itens a seguir.

### Tema

O tema deste trabalho é o desenvolvimento de um sistema de gestão de frota de veículos que atenda, ao mesmo tempo, à operação administrativa geral da Fundação de Saúde Parreiras Horta e à operação especializada do Serviço de Verificação de Óbito, aqui tratado pela sigla SVO. As duas frentes hoje dependem fortemente de veículos e de equipes próprias, mas não contam com uma plataforma única que centralize cadastros, solicitações, manutenção e atendimento.

### Objetivo do Projeto

O objetivo geral é criar uma plataforma que concentre a gestão da frota administrativa e da frota dedicada ao SVO, reduzindo a dependência de controles manuais e informações dispersas e facilitando o acompanhamento das operações.

Os objetivos específicos são:

- Centralizar informações de veículos, motoristas e fornecedores em uma base única.

- Controlar manutenções preventivas e corretivas.

- Registrar abastecimentos e acompanhar o consumo médio de combustível por veículo.

- Controlar documentação obrigatória de veículos e motoristas com alertas de vencimento.

- Registrar multas e infrações e permitir sua associação ao motorista responsável.

- Registrar viagens e quilometragem e apoiar o acompanhamento da utilização da frota.

- Permitir solicitações de viagens, análise pelo gestor, aprovação ou recusa e agendamento sem conflito de horário.

- Disponibilizar painéis de acompanhamento e relatórios em PDF e Excel ou CSV.

- Receber e triar solicitações de atendimento de óbito e gerar ordens de coleta.

- Acompanhar a alocação de veículos e equipes do SVO e o status das ordens em tempo real.

- Manter controle de escalas e plantões das equipes SVO.

- Registrar as principais ações realizadas no sistema para fins de auditoria.

### Delimitação do Problema

O problema central é a ausência de uma plataforma integrada para acompanhar o ciclo de vida dos veículos e o fluxo operacional do SVO. Atualmente, informações sobre veículos, motoristas, manutenção, abastecimento, documentos, multas, viagens e atendimentos de óbito estão dispersas, o que dificulta a consulta e reduz a capacidade de acompanhar os indicadores da operação.

A primeira versão será concentrada na plataforma de gestão de frota e no módulo SVO. Integrações diretas com totens, telefonia e aplicativo móvel para a população estão fora do escopo nesta versão. Também não fazem parte da primeira versão a integração automatizada com sistemas de órgãos públicos, cartórios e Instituto Médico Legal, nem o rastreamento por Sistema de Posicionamento Global em tempo real dos veículos.

### Justificativa da Escolha do Tema

A escolha do tema se justifica pela existência real do problema dentro da fundação. Atualmente, as informações de cadastro de veículos, motoristas, manutenções, abastecimentos, documentação, multas, viagens e atendimentos de óbito não estão centralizadas em uma única plataforma. Isso dificulta o acompanhamento das atividades, aumenta o risco de falhas de comunicação entre os setores e limita a geração de indicadores confiáveis para a tomada de decisão. Além disso, o processo de recebimento de solicitações de óbito pela população ainda é manual e pouco rastreável, o que compromete o tempo de resposta entre a solicitação e a efetiva coleta e transporte do corpo.

### Método de Trabalho

A documentação considera a Modelagem Orientada a Objetos como abordagem de representação do sistema e adota uma organização compatível com um processo incremental de desenvolvimento. O projeto deverá evoluir a partir do núcleo de gestão de frota funcional, seguido do detalhamento e da implementação progressiva das funcionalidades complementares e do fluxo SVO.

As regras de negócio críticas deverão permanecer concentradas no back end, enquanto o front end adapta a apresentação às permissões do usuário. A aplicação deverá ser organizada com React e TypeScript no front end, Node.js e TypeScript no back end, seguindo o padrão arquitetural Model View Controller, com PostgreSQL como banco de dados e Docker com Docker Compose para a conteinerização

### Organização do Trabalho

Este documento está organizado da seguinte forma. O capítulo 2 apresenta a descrição geral do sistema, os envolvidos e as regras de negócio. O capítulo 3 apresenta os requisitos funcionais e não funcionais, o protótipo de referência e as métricas e o cronograma do projeto. O capítulo 4 trata da análise e do design do sistema, incluindo arquitetura, modelo de domínio, diagramas e modelo de dados. O capítulo 5 aborda a implementação. O capítulo 6 apresenta o plano de testes. O capítulo 7 trata da implantação. O capítulo 8 traz o manual do usuário e o capítulo 9 apresenta as conclusões do trabalho.

### Glossário

| **Termo**                               | **Definição**                                                                                                                      |
|-----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| **Abastecimento**                       | Registro de reabastecimento de combustível de um veículo, vinculado ao veículo e ao posto onde foi realizado.                      |
| **DVP**                                 | Documento de Visão do Produto documento de referência que descreve, em alto nível, o problema, os objetivos e o escopo do sistema. |
| **Frota administrativa**                | Conjunto de veículos usados nas operações gerais da FSPH, não vinculados ao SVO.                                                   |
| **Frota SVO**                           | Conjunto de veículos dedicados exclusivamente ao Serviço de Verificação de Óbito.                                                  |
| **FSPH**                                | Fundação de Saúde Parreiras Horta, instituição cliente do sistema.                                                                 |
| **Gestor de Frota**                     | Perfil de usuário responsável por analisar, aprovar ou recusar solicitações de viagem e acompanhar a frota administrativa.         |
| **HEMOSE**                              | Superintendência da FSPH relacionada à hemoderivados, com gestor próprio para solicitações de veículo.                             |
| **IML**                                 | Instituto Médico Legal, órgão acionado em casos de morte com causa externa, distinto do SVO.                                       |
| **LACEN**                               | Superintendência da FSPH relacionada a laboratório central, com gestor próprio para solicitações de veículo.                       |
| **MVC (Model View Controller)**         | Padrão arquitetural que separa o sistema em camadas de dados (Model), interface (View) e lógica de controle (Controller).          |
| **Ordem de coleta**                     | Registro gerado após a confirmação de uma solicitação SVO, que ,aciona a alocação de veículo e equipe.                             |
| **RBAC (Role-Based Access Control)**    | Modelo de controle de acesso baseado em perfis (papeis) de usuário.                                                                |
| **RF (Requisito Funcional)**            | Descrição de uma funcionalidade que o sistema deve executar.                                                                       |
| **RN (Regra de Negócio)**               | Restrição ou condição de negócio que o sistema deve respeitar, independentemente da tela ou funcionalidade.                        |
| **RNF (Requisito Não-Funcional)**       | Característica de qualidade do sistema (desempenho, segurança, usabilidade etc.), e não uma funcionalidade em si.                  |
| **Solicitação de viagem**               | Pedido registrado por um usuário institucional para uso de um veículo da frota, com data, horário, origem, destino e finalidade.   |
| **SVO**                                 | Serviço de Verificação de Óbito, módulo do sistema responsável pelo atendimento de solicitações de óbito da população.             |
| **Usuário Institucional / Solicitante** | Perfil que registra solicitações de viagem e acompanha o status das próprias solicitações.                                         |

## Descrição Geral do Sistema

### Descrição do Problema

A fundação opera atualmente dois conjuntos de processos com forte dependência de veículos, a frota administrativa e operacional geral e a frota dedicada às operações do SVO. As informações de cadastro de veículos, motoristas, manutenções, abastecimentos, documentação, multas, viagens e atendimentos de óbito não estão centralizadas em uma única plataforma.

Quem é afetado pelo problema:

- Gestores de frota, que hoje decidem sobre alocação de veículos e aprovação de viagens com base em controles manuais e dispersos

- Motoristas e operadores, que registram viagens e abastecimentos sem um sistema único de apoio

- Equipes do SVO, responsáveis pelo atendimento de solicitações de óbito e pela coleta e transporte de corpos

- A população, que hoje registra solicitações de óbito por um processo manual e pouco rastreável

O impacto do problema aparece na falta de visibilidade em tempo real sobre a disponibilidade e o estado dos veículos, no risco de vencimento não identificado de documentos obrigatórios e da CNH dos motoristas, na dificuldade de apurar custos de manutenção, combustível e locação de forma consolidada, na falta de indicadores de tempo de resposta entre a solicitação de óbito e a efetiva coleta e transporte do corpo, e na tomada de decisão gerencial baseada em informações fragmentadas.

A solução proposta é consolidar a gestão da frota administrativa e da frota do SVO em uma única plataforma, reduzindo custos operacionais, aumentando a rastreabilidade do ciclo de vida dos veículos e melhorando o tempo de resposta e a qualidade do atendimento às solicitações de óbito.

### Principais Envolvidos e suas Características

#### [Usuários do Sistema](https://canva.link/37zaem3lzldub1c)

| Perfil                               | Responsabilidades principais                                                                                                             |
|--------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| Administrador                        | Gerenciamento do sistema, usuários, permissões e configurações gerais.                                                                   |
| Usuário Institucional ou Solicitante | Criação de solicitações de viagens institucionais e consulta do status da própria solicitação.                                           |
| Gestor de Frota                      | Acompanhamento de paineis e relatórios, gestão de cadastros de motoristas e veículos, análise de solicitações, aprovações e agendamento. |
| Motorista                            | Registro de viagens, abastecimentos e consulta dos veículos a ele vinculados.                                                            |
| Gestor SVO                           | Registro e triagem das solicitações da população e geração de ordens de coleta.                                                          |
| Motorista SVO                        | Visualização das ordens alocadas e atualização do andamento dos atendimentos.                                                            |

#### Desenvolvedores do Sistema

O desenvolvimento envolve uma equipe responsável por construir o backend em Node.js e TypeScript, o frontend em React e TypeScript, a modelagem e a manutenção do banco de dados PostgreSQL, além da conteinerização da aplicação com Docker e Docker Compose, conforme definido nas restrições técnicas do Documento de Visão do Produto.

### Regras de Negócio

| ID   | Regra de negócio                                                                                                                                           |
|------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| RN01 | Toda solicitação de viagem institucional deve registrar data, horário, origem, destino e finalidade.                                                       |
| RN02 | A aprovação ou recusa de uma solicitação de viagem é responsabilidade do Gestor de Frota.                                                                  |
| RN03 | Uma viagem aprovada deve ser agendada no sistema e o veículo deve ficar reservado para o período correspondente.                                           |
| RN04 | O sistema deve impedir a aprovação de viagens sobrepostas para o mesmo veículo.                                                                            |
| RN05 | A disponibilidade deve ser verificada considerando data e horário da solicitação.                                                                          |
| RN06 | O cadastro de veículos deve permitir distinguir a frota administrativa da frota dedicada ao SVO.                                                           |
| RN07 | Toda saída de veículo deve possuir destino informado, conforme necessidade registrada nas anotações da equipe.                                             |
| RN08 | As escalas e plantões das equipes SVO devem ser registráveis e parametrizáveis.                                                                            |
| RN09 | Solicitações SVO confirmadas devem originar ordens de coleta.                                                                                              |
| RN10 | Uma ordem de coleta deve ser alocada somente a veículo e equipe que estejam disponíveis para o atendimento.                                                |
| RN11 | Cada veículo SVO possui capacidade máxima de quatro óbitos simultaneamente, conforme DVP.                                                                  |
| RN12 | O sistema deve impedir nova alocação em veículo SVO cuja capacidade já esteja totalmente ocupada.                                                          |
| RN13 | A ocupação do veículo SVO deve ser apresentada como quantidade atual em relação à capacidade total.                                                        |
| RN14 | O módulo SVO deve manter o acompanhamento do status da coleta e do transporte.                                                                             |
| RN15 | Documentos obrigatórios de veículos e motoristas devem possuir controle de vencimento e alerta.                                                            |
| RN16 | Abastecimentos da frota administrativa devem registrar o posto utilizado dentro da rede credenciada pelo fornecedor de cartão combustível indicada no DVP. |
| RN17 | Multas e infrações devem poder ser vinculadas ao motorista responsável.                                                                                    |
| RN18 | As ações principais realizadas no sistema devem ser registradas para auditoria.                                                                            |
| RN19 | O controle de permissões deve ser validado no back end.                                                                                                    |
| RN20 | Relatórios gerenciais devem permitir exportação em PDF e Excel ou CSV.                                                                                     |
| RN21 | A plataforma deve manter uma separação clara entre a frota administrativa e a frota SVO sem perder a rastreabilidade.                                      |

| Ponto de validação                 | Situação atual                                                                                                                          |
|------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Confirmação de rota pelo motorista | Sugestão da equipe, ainda não definida como regra obrigatória no DVP.                                                                   |
| Notificação automática do gestor   | Apontada como diferencial nas anotações, sem detalhamento de canal ou regra no DVP.                                                     |
| Agrupamento de solicitações iguais | Sugestão para quando houver mesmo tipo, horário e localização. Deve considerar a capacidade do veículo antes de qualquer agrupamento.   |
| Material sensível no veículo       | Sugestão de uso de uma sinalização no cadastro ou na operação. O DVP não define a implementação.                                        |
| Agente de atendimento              | Considerado evolução posterior ao sistema funcional e testado. Não faz parte do núcleo da primeira entrega conforme anotação da equipe. |

## Requisitos do Sistema

Os requisitos desta seção foram consolidados a partir das funcionalidades explicitadas no DVP e das necessidades complementares presentes nas anotações. A prioridade considera a centralidade da gestão de frota funcional e a necessidade de manter o escopo controlado.

### Requisitos Funcionais

| ID   | Nome                                | Atores                         | Descrição                                                                        |
|------|-------------------------------------|--------------------------------|----------------------------------------------------------------------------------|
| RF01 | Autenticar usuário                  | Administrador, demais usuários | Permitir acesso mediante credenciais válidas e perfil autorizado.                |
| RF02 | Gerenciar usuários e perfis         | Administrador                  | Cadastrar, consultar e administrar usuários e seus papéis de acesso.             |
| RF03 | Cadastrar veículos                  | Administrador, Gestor de Frota | Registrar informações necessárias para identificação e gestão dos veículos.      |
| RF04 | Cadastrar motoristas                | Administrador, Gestor de Frota | Registrar motoristas e dados necessários ao vínculo com a frota.                 |
| RF05 | Cadastrar fornecedores              | Administrador, Gestor de Frota | Registrar fornecedores relacionados à operação da frota.                         |
| RF06 | Controlar documentação              | Administrador, Gestor de Frota | Registrar documentos, vencimentos e emitir alertas de vencimento.                |
| RF07 | Registrar manutenção                | Gestor de Frota                | Registrar manutenções preventivas e corretivas.                                  |
| RF08 | Registrar abastecimento             | Motorista, Gestor de Frota     | Registrar abastecimento e manter histórico por veículo.                          |
| RF09 | Calcular consumo médio              | Gestor de Frota                | Disponibilizar histórico que permita acompanhar o consumo médio de combustível.  |
| RF10 | Registrar multa ou infração         | Gestor de Frota                | Registrar ocorrência e vinculá-la ao motorista responsável quando aplicável.     |
| RF11 | Registrar solicitação de viagem     | Usuário Institucional          | Informar data, horário, origem, destino e finalidade da viagem.                  |
| RF12 | Analisar solicitação de viagem      | Gestor de Frota                | Consultar disponibilidade e decidir pela aprovação ou recusa.                    |
| RF13 | Agendar viagem aprovada             | Gestor de Frota                | Reservar o veículo para o período aprovado.                                      |
| RF14 | Impedir conflito de agendamento     | Sistema                        | Bloquear sobreposição para o mesmo veículo.                                      |
| RF15 | Registrar viagem                    | Motorista, Gestor de Frota     | Registrar a realização da viagem e a quilometragem correspondente.               |
| RF16 | Acompanhar disponibilidade da frota | Gestor de Frota, Administrador | Exibir a disponibilidade dos veículos por data e horário.                        |
| RF17 | Gerar dashboard                     | Gestor de Frota, Administrador | Exibir indicadores de frota e SVO com dados atualizados.                         |
| RF18 | Exportar relatórios                 | Gestor de Frota, Administrador | Gerar relatórios em PDF e Excel ou CSV.                                          |
| RF19 | Registrar solicitação SVO           | População, Gestor SVO          | Receber dados necessários para a solicitação de atendimento de óbito.            |
| RF20 | Triar solicitação SVO               | Gestor SVO                     | Analisar e confirmar solicitações recebidas.                                     |
| RF21 | Gerar ordem de coleta               | Gestor SVO, Sistema            | Criar ordem de coleta após confirmação da solicitação.                           |
| RF22 | Alocar veículo SVO                  | Gestor SVO                     | Vincular veículo disponível à ordem de coleta.                                   |
| RF23 | Alocar equipe SVO                   | Gestor SVO                     | Vincular equipe disponível à ordem de coleta.                                    |
| RF24 | Controlar capacidade SVO            | Sistema                        | Considerar capacidade máxima e impedir sobrealocação.                            |
| RF25 | Acompanhar status da ordem          | Gestor SVO                     | Atualizar e consultar o andamento da coleta e do transporte.                     |
| RF26 | Controlar escalas e plantões        | Responsáveis autorizados       | Cadastrar e consultar escalas das equipes SVO.                                   |
| RF27 | Auditar ações                       | Administrador, sistema         | Registrar ações principais realizadas pelos usuários.                            |
| RF28 | Disponibilizar acesso responsivo    | Todos                          | Permitir uso em computador, celular e tablet.                                    |
| RF29 | Controlar separação de frota        | Administrador, Gestor de Frota | Distinguir veículos administrativos e veículos SVO no cadastro e acompanhamento. |
| RF30 | Controlar destino da saída          | Motorista, Gestor de Frota     | Garantir que uma saída de veículo possua destino informado.                      |

#### 3.1.1 Especificação resumida dos fluxos principais

| Fluxo                          | Atores                   | Fluxo principal                                                                                                                                                                          | Pós condição                                             |
|--------------------------------|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------|
| Solicitar viagem institucional | Usuário Institucional    | Usuário informa data, horário, origem, destino e finalidade. O sistema registra a solicitação e a apresenta para análise do Gestor de Frota.                                             | Solicitação criada e aguardando decisão.                 |
| Aprovar ou recusar viagem      | Gestor de Frota          | O Gestor consulta a disponibilidade do veículo e do motorista. Em caso de aprovação, o sistema agenda a viagem e reserva o veículo. Em caso de recusa, registra o status correspondente. | Solicitação aprovada e agendada ou solicitação recusada. |
| Registrar viagem               | Motorista                | Motorista consulta o veículo vinculado, registra a saída com destino e, quando definido na implementação, demais dados de execução da viagem.                                            | Viagem registrada e disponível para acompanhamento.      |
| Receber solicitação SVO        | População, Atendente SVO | Solicitação é registrada e enviada para triagem.                                                                                                                                         | Solicitação disponível para análise.                     |
| Triar e gerar ordem SVO        | Atendente SVO            | Atendente verifica a solicitação. Após confirmação, o sistema gera uma ordem de coleta.                                                                                                  | Ordem pronta para alocação.                              |
| Alocar ordem SVO               | Equipe autorizada        | Responsável consulta veículos e equipes disponíveis e realiza a alocação respeitando a capacidade do veículo.                                                                            | Ordem alocada e acompanhável.                            |

### Requisitos Não-Funcionais

devo explicar oq são? Sim!

| ID    | Categoria                                     | Requisito                                                                                                                                             |
|-------|-----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| RNF01 | Acesso                                        | A solução deve ser disponibilizada como aplicação.                                                                                                    |
| RNF02 | Responsividade                                | A aplicação deve funcionar em computador, celular e tablet.                                                                                           |
| RNF03 | Segurança de acesso                           | As permissões devem ser validadas no back end de acordo com o perfil do usuário.                                                                      |
| RNF04 | Tecnologia do front end                       | React e TypeScript.                                                                                                                                   |
| RNF05 | Tecnologia do back end                        | Node.js e TypeScript.                                                                                                                                 |
| RNF06 | Padrão arquitetural                           | Model View Controller.                                                                                                                                |
| RNF07 | Banco de dados                                | PostgreSQL.                                                                                                                                           |
| RNF08 | Containerização                               | Toda a aplicação deve ser containerizada com Docker.                                                                                                  |
| RNF09 | Orquestração local ou de implantação definida | Docker Compose deverá ser utilizado para orquestrar os containers da aplicação.                                                                       |
| RNF10 | Integridade operacional                       | O sistema não deve permitir conflito de agendamento do mesmo veículo e não deve ultrapassar a capacidade definida para veículos SVO.                  |
| RNF11 | Rastreabilidade                               | As principais ações devem gerar registros de auditoria.                                                                                               |
| RNF12 | Disponibilidade de dados                      | O dashboard deve refletir dados atualizados e confiáveis para apoiar decisões.                                                                        |
| RNF13 | Escalabilidade                                | A arquitetura em containers deve permitir ajuste de capacidade conforme a necessidade.                                                                |
| RNF14 | Zero custo de licenciamento obrigatório       | A anotação da equipe indica a busca por uma solução sem custo. A escolha definitiva dos componentes deverá validar esse ponto antes da implementação. |

### Protótipo

O material visual fornecido pela equipe representa um fluxo conceitual inicial, não um protótipo final. Ele mostra ideias relacionadas a portal de solicitação, gestão de usuários, atuação do gestor, motorista, cadastro de veículo, checklist, histórico e aprovação ou reprovação. Também aparecem campos discutidos para o pedido, como tipo de viagem, destino, horário de saída e chegada prevista e quantidade de pessoas ou carga.

![Fluxo visual preliminar](media/image1.jpg)

*Figura 1. Fluxo visual preliminar discutido pela equipe. A imagem serve como referência de entendimento e não representa o protótipo final.*

A partir desse material, o protótipo deverá evoluir para telas navegáveis que contemplem pelo menos o acesso, o painel inicial, o cadastro de veículos, o cadastro de motoristas, a solicitação de viagem, a análise pelo gestor, o calendário ou visão de disponibilidade, o registro de viagem, o controle de manutenção, o abastecimento, o controle documental, multas, o fluxo SVO, as ordens de coleta, as escalas e os relatório

### Diagrama de Classes

![Diagrama de classes](media/image2.png)

### Modelo de Dados

#### Modelo Lógico da Base de Dados

![Modelo lógico da base de dados](media/image3.jpg)

### Ambiente de Desenvolvimento

- Frontend: React

- Backend: Node.js

- Linguagem: TypeScript

- Banco de Dados: PostgreSQL

- Conteinerização: Docker

## Conclusões e Considerações Finais

Este capítulo tem como objetivo apresentar e demonstrar a aplicabilidade dos resultados obtidos, suas limitações, inovação, possíveis integrações com outros projetos e continuação do sistema em trabalhos futuros.

### 5.1. Síntese do trabalho

A documentação consolida a proposta de um sistema web que reúne a gestão da frota administrativa da FSPH e a operação especializada do SVO. Foram descritos o problema, os perfis de usuário, os requisitos funcionais e não funcionais, as regras de negócio, os principais fluxos, o backlog, a arquitetura técnica, o modelo lógico de dados e os endpoints previstos para a API.

### 5.2. Aplicabilidade e limitações

A solução proposta pode melhorar a centralização das informações, a rastreabilidade das viagens e solicitações, o acompanhamento da disponibilidade dos veículos e o controle da capacidade das unidades do SVO. Esses benefícios são objetivos esperados, não resultados medidos, pois os arquivos disponíveis não registram implantação ou testes funcionais concluídos.

A primeira versão não contempla rastreamento GPS em tempo real nem integração automatizada com órgãos públicos, cartórios, IML, telefonia, totens ou aplicativo móvel para a população. Também não há uma ferramenta de IA integrada. DBSCAN para agrupamento espacial e pgRouting para cálculo de rotas aparecem como possibilidades de evolução e dependem de detalhamento técnico posterior.

### 5.3. Continuidade do projeto

A continuidade prevista é implementar primeiro o núcleo de gestão de frota e, de forma incremental, avançar para o módulo SVO. Em seguida, deverão ser testadas as regras críticas, concluídos os artefatos de documentação que permanecem pendentes e validada a solução com a FSPH. As estimativas de esforço, os prazos e os critérios finais de homologação ainda precisam ser definidos e confirmados.
