# Análise do Estudo de Caso

## Objetivo

Analisar o estudo de caso recebido pelo grupo, compreendendo o problema apresentado, seus usuários, contexto de utilização, objetivos, restrições e características da solução proposta.

A análise deverá demonstrar que o grupo compreendeu o que precisa ser desenvolvido, para quem, por que e em quais condições.

### O que o grupo deverá fazer

O grupo deverá analisar o estudo de caso fornecido e produzir uma síntese crítica do projeto.

Não é necessário repetir integralmente as informações apresentadas no estudo de caso. O objetivo é interpretar as informações e identificar suas implicações para o desenvolvimento do aplicativo.

A análise deverá contemplar os seguintes pontos.

## Problema

### Qual problema o aplicativo pretende ajudar a solucionar?

O aplicativo pretende solucionar a falta de controle centralizado sobre as solicitações e a utilização dos veículos da FSPH.

Atualmente, grande parte das solicitações acontece por telefone e WhatsApp, o que dificulta o registro, a aprovação e a visualização conjunta das viagens. Como consequência, podem ocorrer viagens duplicadas, veículos subutilizados, conflitos de agenda e dificuldade para identificar qual veículo e motorista estão envolvidos em cada deslocamento.

O problema se torna ainda mais complexo porque a Fundação possui diferentes tipos de transporte, como deslocamentos de doadores e pacientes, campanhas, coletas laboratoriais, transporte relacionado ao SVO e situações que envolvem corpos ou veículos com características específicas.

### Por que esse problema é relevante?

O problema é relevante porque afeta diretamente a eficiência operacional, o custo e a capacidade de atendimento da frota.

Uma solicitação mal organizada pode ocupar um veículo que poderia atender outra demanda, aumentar o consumo de combustível e dificultar o atendimento de campanhas e coletas programadas. Além disso, a ausência de um registro confiável reduz a rastreabilidade das operações e dificulta a fiscalização e a análise posterior das viagens.

### Qual é a principal necessidade que a solução deverá atender?

A principal necessidade é centralizar e organizar todo o ciclo de uma viagem, desde a solicitação até o encerramento.

O sistema deve permitir que a instituição saiba:

> quem solicitou → por que solicitou → quem aprovou → quando será realizada → qual veículo será utilizado → qual motorista conduzirá → qual foi o trajeto → quanto foi consumido → qual foi o resultado da viagem.

Isso deve acontecer de maneira simples e confiável, inclusive em situações de conectividade limitada.

## Público e usuários

### Quem é?

Profissionais dos diferentes setores da Fundação que precisam solicitar um veículo para realizar uma atividade.

### Qual relação possui com o aplicativo?

São os principais usuários do fluxo de solicitação. Utilizam o sistema para informar a necessidade de transporte e acompanhar a situação do pedido.

### Quais necessidades possui?

- Solicitar um veículo com rapidez.
- Informar origem, destino, data, horário e finalidade.
- Saber se a solicitação foi aprovada.
- Acompanhar qual veículo e motorista foram definidos.
- Consultar o histórico das solicitações.

### Em que situação poderá utilizar a solução?

Antes de campanhas, coletas, atendimentos, deslocamentos de pacientes/doadores e outras atividades programadas.

## Contexto de uso

O aplicativo poderá ser utilizado nos seguintes contextos.

### Ambiente

- Setores administrativos da Fundação.
- Recepções e áreas de atendimento.
- Dentro dos veículos.
- Campanhas e deslocamentos externos.
- Cidades do interior.
- Operações relacionadas ao Hemocentro/Hemose, LACEN, SVO e demais setores.

### Momento de utilização

Existem pelo menos três momentos distintos:

- **Antes da viagem:** solicitação, aprovação e agendamento.
- **Durante a viagem:** acompanhamento, registro de saída, rota e consumo.
- **Depois da viagem:** encerramento, histórico, análise de consumo e avaliação da utilização da frota.

### Condições do usuário

Os usuários podem estar em situações muito diferentes.

O gestor da frota provavelmente estará realizando várias tarefas simultaneamente, enquanto um motorista poderá estar utilizando o sistema em campo, com atenção voltada para a operação do veículo.

Por isso, a interface não pode depender de longos formulários ou de leitura extensa em momentos críticos.

### Dispositivo

O cenário descrito indica forte dependência de celulares, inclusive porque os motoristas frequentemente utilizam seus próprios aparelhos e alguns locais possuem celulares corporativos.

Uma implicação de projeto é que as principais ações precisam funcionar muito bem em telas menores e por toque.

### Conectividade

Esse é um dos fatores mais importantes do projeto.

O sistema deverá funcionar em locais onde a conexão pode falhar. Por isso, precisa existir modo offline e sincronização posterior, além do telefone como canal alternativo quando necessário.

A solução não pode pressupor que o usuário estará sempre conectado.

### Iluminação

O aplicativo poderá ser utilizado em ambientes internos, externos e dentro de veículos. Isso significa que a interface deve manter boa legibilidade em diferentes condições de iluminação.

Não há uma especificação formal de contraste ou modo claro/escuro no estudo de caso, portanto essas decisões deverão ser definidas posteriormente no projeto.

### Nível de atenção

Esse é um contexto de atenção variável.

O gestor pode dedicar bastante atenção ao planejamento, enquanto um motorista ou profissional em uma ocorrência pode ter atenção limitada.

Consequentemente, ações importantes devem ser rápidas, objetivas e facilmente identificáveis.

### Situação de urgência

Algumas solicitações são urgentes, especialmente casos relacionados a óbitos e coletas.

Isso gera uma tensão importante no projeto: o sistema deve ser rápido o suficiente para não impedir um atendimento urgente, mas precisa manter o máximo possível de registro e controle.

### Outras condições específicas

Existem veículos com capacidades e funções diferentes. Por exemplo:

- Veículos comuns para aproximadamente 5 pessoas.
- Veículo maior para até 10 pessoas.
- Transporte de até 2 corpos em determinadas operações.
- Veículos refrigerados.
- Veículos destinados a finalidades específicas.

Isso significa que o sistema não pode tratar todos os veículos como se fossem equivalentes.

### Como esses contextos podem influenciar o desenvolvimento?

O aplicativo deverá priorizar simplicidade, rapidez, legibilidade, funcionamento offline, baixo esforço de interação, identificação clara de veículo e motorista e tratamento de situações urgentes e específicas.

O contexto de uso torna a confiabilidade mais importante do que uma interface excessivamente sofisticada.

## Objetivo e proposta de valor

O aplicativo pretende oferecer uma central digital de gestão de transporte da FSPH, conectando solicitantes, gestores e motoristas em um único fluxo.

A principal proposta de valor é transformar uma operação atualmente fragmentada em uma operação registrada, visível e organizada.

- **Para o solicitante:** saber que sua solicitação foi recebida e qual será seu atendimento.
- **Para o gestor:** ter uma visão consolidada da frota e poder evitar deslocamentos desnecessários.
- **Para o motorista:** receber informações claras sobre a viagem e registrar sua execução.
- **Para a instituição:** obter melhor aproveitamento dos veículos, redução de viagens redundantes, maior rastreabilidade e possibilidade de analisar gastos e consumo.

## Personalidade, identidade e experiência

### Palavras conceituais

As principais palavras conceituais são organização, controle, eficiência, rastreabilidade, agilidade, segurança, disponibilidade, integração, economia e confiabilidade.

Essas palavras representam melhor o propósito do produto do que conceitos puramente tecnológicos.

### Personalidade da identidade

Institucional, confiável, objetiva, operacional e eficiente.

### Tom da interface

O tom da interface deve ser direto, claro e funcional.

Em vez de termos burocráticos ou mensagens longas, a interface deve informar exatamente o que aconteceu. Por exemplo, “Solicitação aprovada” é melhor para o contexto do que uma mensagem longa explicando o processo.

Também será importante diferenciar visualmente estados como:

> Solicitado → Em análise → Aprovado → Agendado → Em viagem → Concluído.

### Tom da experiência do usuário

A experiência deve transmitir segurança e previsibilidade.

O usuário precisa sentir que o sistema sabe o que está acontecendo e que existe controle sobre a operação. Em situações urgentes, a experiência deve ser ainda mais objetiva, reduzindo o número de decisões necessárias.

### Forma como o aplicativo deseja ser lembrado

Uma possibilidade de posicionamento seria:

> “A frota organizada em um só lugar.”

Ou, de forma mais institucional:

> “Menos viagens desnecessárias. Mais controle sobre cada deslocamento.”

A ideia central é associar o aplicativo a controle, economia e organização, e não apenas a “mais um sistema para fazer solicitações”.

### Influência dessas características na solução

Essas características devem orientar toda a experiência.

O aplicativo não deve parecer um sistema burocrático ou complexo. Deve funcionar como uma ferramenta operacional que reduz a desorganização existente.

Por isso, informações críticas precisam estar sempre fáceis de encontrar, e o sistema deve mostrar claramente quem solicitou, quem aprovou, qual veículo foi escolhido, qual motorista está responsável e qual é o status da viagem.

## Funcionalidades e características já definidas

| Funcionalidade | Necessidade atendida |
| --- | --- |
| Solicitação de veículo | Permite formalizar a demanda em vez de depender apenas de WhatsApp/telefone. |
| Aprovação da solicitação | Dá controle ao responsável pela frota. |
| Agendamento | Evita conflitos e organiza a agenda. |
| Agenda consolidada da frota | Permite visualizar todos os veículos e horários. |
| Registro obrigatório de veículo e motorista | Garante rastreabilidade e responsabilidade. |

## Restrições e condições

### Quantidade de telas

O estudo de caso não define um número exato de telas. Portanto, essa informação deverá ser definida pela equipe durante a prototipação.

A recomendação é evitar excesso de telas e concentrar o fluxo nas tarefas principais.

### Número de interações

Também não existe no estudo de caso um limite numérico de interações. Entretanto, devido ao caráter operacional, as ações frequentes devem exigir poucas etapas.

### Dispositivos

O cenário prevê utilização principalmente por celulares, inclusive aparelhos pessoais de motoristas.

### Versão do sistema operacional

O estudo de caso não especifica uma versão mínima de Android ou iOS. Essa definição deverá ser feita posteriormente.

### Tamanho do aplicativo

Não há restrição especificada.

### Privacidade

Existe necessidade de cuidado com os dados de motoristas, veículos e documentos administrativos.

O sistema deverá preservar a responsabilidade e a rastreabilidade sem expor dados desnecessariamente.

### Armazenamento

O sistema precisa armazenar informações localmente para permitir funcionamento sem internet e posteriormente sincronizá-las.

### Conectividade

É uma das principais restrições do projeto: o sistema não pode depender permanentemente de internet.

### Navegação

A navegação deve priorizar ações operacionais e evitar profundidade excessiva, principalmente para os usuários de campo.

### Acessibilidade

Não há requisitos específicos definidos no estudo de caso. Ainda assim, a necessidade de leitura rápida, diferentes ambientes e utilização em celular torna importante considerar legibilidade e clareza desde o início.

### Ambiente de utilização

O aplicativo será usado tanto em ambientes administrativos quanto em situações externas, veículos, interior do estado e ocorrências urgentes.

### Outras condições específicas

É necessário considerar:

- Diferentes categorias e capacidades de veículos.
- Veículos com restrições específicas.
- Transporte de corpos.
- Veículos refrigerados.
- Demandas programadas e emergenciais.
- Motoristas com aparelhos pessoais.
- Utilização de WhatsApp/telefone como canais existentes.
- Necessidade de rastreabilidade.
- Possibilidade de integração futura com SVO/IML.

## Pontos de atenção

Os três aspectos mais importantes para o sucesso do aplicativo são os seguintes.

### 1. Confiabilidade e funcionamento em diferentes condições de conectividade

Esse é provavelmente o fator mais importante.

O aplicativo será utilizado em locais onde a internet pode não estar disponível. Se o sistema deixar de funcionar completamente quando a conexão cair, ele não resolverá justamente uma das dificuldades da operação.

Por isso, o offline e a sincronização não devem ser tratados como recursos secundários. Eles precisam fazer parte da arquitetura e da experiência desde o início.

### 2. Simplicidade em situações operacionais e urgentes

O sistema precisa atender tanto uma solicitação programada quanto uma situação urgente.

Se o fluxo exigir muitas etapas, campos ou decisões, o usuário poderá voltar ao telefone ou WhatsApp, mantendo o problema original.

Portanto, a experiência deve ser rápida, objetiva e orientada à tarefa, principalmente para motoristas e usuários envolvidos em ocorrências.

### 3. Qualidade e rastreabilidade dos dados da frota

O valor do sistema não estará apenas em registrar solicitações, mas em construir uma fonte confiável de informação sobre a frota.

Saber qual veículo foi utilizado, quem dirigiu, qual rota foi realizada, quanto foi consumido e quando a viagem ocorreu permitirá à Fundação tomar decisões melhores, identificar desperdícios e avaliar a eficiência da operação.

Sem dados confiáveis, a agenda digital apenas reproduziria parte dos problemas atuais em uma nova interface.

## Relação com o estudo de caso

Toda a análise deverá estar diretamente relacionada ao estudo de caso recebido pelo grupo.

Não será suficiente apresentar uma análise genérica sobre o tema. As respostas deverão demonstrar que o grupo considerou as características específicas do seu projeto.

Por exemplo, se o estudo de caso estabelece que o aplicativo será utilizado em uma situação de emergência, essa condição deverá aparecer na análise e gerar implicações para a solução.
