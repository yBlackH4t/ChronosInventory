/* Arquivo gerado automaticamente por frontend/scripts/sync_changelog.mjs */
/* Nao edite manualmente: atualize CHANGELOG.md e rode npm run changelog:sync */

export type ReleaseEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

export const RELEASE_ENTRIES: ReleaseEntry[] = [
  {
    "version": "2.7.4",
    "date": "2026-10-26",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Busca rápida (Ctrl+K) com prévia: à direita aparecem a foto, o código, a marca e o saldo por filial do produto escolhido.",
      "Novo: Minimapa nas Movimentações por dia: um traço por dia (verde entradas, laranja saídas). Passar o mouse mostra os totais; clicar pula para o dia.",
      "Novo: Botões com progresso: \"Publicar base oficial\", \"Buscar\" da nota fiscal e \"Gerar PDF\" mostram o progresso dentro do botão e terminam com um ✓. Clicar no código da peça em Produtos copia o código (\"✓ Copiado\"); os botões da linha só aparecem ao passar o mouse. Busca sem resultado tem \"Cadastrar esta peça\".",
      "Novo: Desfazer e arrastar: tirar item da Lista personalizada, limpar a lista ou excluir um perfil de etiqueta tem \"Desfazer\" no aviso. Perfis de etiqueta (Layout > Ordenar perfis) e as colunas das filiais em Produtos (pelo título) mudam de ordem arrastando.",
      "Novo: Animações (Completo e Suave; no \"Nenhum\" nada se mexe): avisos que deslizam e somem sozinhos, brilho no carregamento, item lido no lote sobe para o topo (código não achado faz o quadro tremer), valor do dia ao passar o mouse nas linhas do Painel e brilho que segue o mouse nos cartões, foto que cresce da miniatura, produto excluído que sai encolhendo, etapas da nota com o traço enchendo, troca claro/escuro com um círculo, e o ponto do serviço no topo âmbar quando lento e vermelho quando cai.",
      "Mudanca: Produtos com tabela mais clara: o código da peça ganhou uma coluna própria (\"Código\"), alinhada, como no sistema da empresa. O nome vem em destaque logo depois, os saldos por filial e o total ficam em seguida e as saídas dos últimos 90 dias foram para o fim da linha. Os títulos das colunas não quebram mais em duas linhas.",
      "Mudanca: Inventário no visual novo: a sessão aberta mostra um anel com quanto já foi contado, o local e o status em selos (\"Em contagem\" pulsa). Os números do resumo sobem ao abrir e têm uma barrinha com a parte de cada um no total. Na contagem, o código aparece em destaque e a diferença vira um selo (\"+1 sobrando\", \"−2 faltando\", \"OK\"), com um traço nas linhas com diferença.",
      "Mudanca: Etiquetas: Estoque e Expedição (NF-e) viraram a pílula deslizante das outras telas. A lista mostra o código em destaque e o total na cor do saldo (verde, âmbar ou vermelho).",
      "Mudanca: Relatórios: cada relatório mostra uma miniatura da folha que vai sair, com as colunas do PDF, e ao lado os números de verdade (ex.: unidades em estoque por filial e itens zerados). O relatório escolhido fica marcado com uma faixa colorida.",
      "Correcao: Inventário: a sessão mostrava \"Local #null\" no lugar do nome do local.",
      "Correcao: Cor Grafite no tema escuro: o botão \"Movimentar\" e os outros botões claros ficavam pretos, como se as cores estivessem invertidas."
    ]
  },
  {
    "version": "2.7.3",
    "date": "2026-10-26",
    "title": "Ajustes operacionais",
    "highlights": [
      "Mudanca: Movimentações mais limpas: uma movimentação lançada errado e o estorno que a desfez saem juntos da lista de Movimentações. Eles não são apagados: continuam guardados, aparecem no histórico do produto, e o saldo e os relatórios não mudam. Para vê-los, ligue \"Mostrar estornados\" ao lado dos filtros. Filtrar pela natureza \"Estorno\" também mostra os estornos."
    ]
  },
  {
    "version": "2.7.2",
    "date": "2026-10-26",
    "title": "Novas funcionalidades",
    "highlights": [
      "Novo: Nota fiscal com produto desativado: ao ler a nota, o Chronos também acha os produtos desativados (antes pulava e sugeria outro item). O item aparece marcado \"desativado\" com o botão \"Reativar\", ali mesmo na tela da nota. A busca de produto na nota também mostra os desativados.",
      "Novo: Cadastrar produto dentro da nota: cada item tem \"Cadastrar novo\". O nome vem da descrição da nota, o produto entra com saldo 0 e já fica escolhido no item.",
      "Novo: Notas da própria empresa: o código do item na nota da matriz ou da filial é o número (#) do produto no Chronos. Com o mesmo nome, esse produto vem sugerido primeiro.",
      "Novo: Vários CNPJs salvos: em \"Configurar\" da nota fiscal dá para salvar os CNPJs da empresa (ex.: Canoas e Matriz). Ao bipar a nota, o Chronos usa sozinho o CNPJ que está nela, inclusive para baixar da SEFAZ, e mostra qual usou.",
      "Novo: Perfis de etiqueta de expedição: em Etiquetas > Expedição (NF-e), escolha o perfil na lista ao lado de \"Layout\" (Perfil 1, Perfil 2...). Cada perfil guarda o seu layout sozinho. Já vem o perfil \"Crua (sem marca)\", sem logo e sem remetente, para notas despachadas em nome do cliente. Em Layout: salvar como novo perfil, renomear, excluir e novo perfil cru. Importar layout cria um perfil novo. Depois da baixa da nota, dá para escolher o perfil antes de imprimir."
    ]
  },
  {
    "version": "2.7.1",
    "date": "2026-10-22",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Etiqueta da NF depois da baixa: ao dar saída de uma NF (pela foto da DANFE ou pela chave), aparece o botão \"Imprimir etiqueta\". Ele usa o XML que o Chronos já leu e o layout salvo em Etiquetas > Expedição (NF-e), uma etiqueta por volume da nota. Ao bipar de novo uma nota já baixada, o botão também aparece para reimprimir.",
      "Novo: Modelo de etiqueta meia folha: em Etiquetas > Expedição (NF-e) > Layout > \"Usar modelo meia folha\". Duas etiquetas por A4 com remetente e logo, destinatário com endereço e CEP, cidade em letra grande, e nota, volume (em destaque) e peso em caixas. O logo que já estava no layout é aproveitado, e \"Voltar ao layout anterior\" desfaz.",
      "Novo: Campos novos para a etiqueta: endereço, CEP, cidade/UF e remetente. Blocos podem ter moldura e fundo preto.",
      "Correcao: Impressão da etiqueta de NF: o texto de cada bloco saía uma linha abaixo e um pouco à direita do que aparecia no desenho. Agora sai no mesmo lugar. Peso com vírgula (18,4 kg)."
    ]
  },
  {
    "version": "2.7.0",
    "date": "2026-10-21",
    "title": "Novas funcionalidades",
    "highlights": [
      "Novo: Cadastro da empresa: em Backup > Catálogo, importe o arquivo de produtos do sistema da loja (produtos_completos.csv). Antes de gravar, o Chronos mostra o que vai mudar. Depois cadastra os produtos que ainda não existem, com saldo zero, e guarda as aplicações (veículo e motor) e os códigos similares dos turbos e conjuntos que o catálogo Master Power não tem. O assistente passa a achar essas peças pelo veículo, pelo motor e pelos similares. O saldo não muda, e uma cópia de segurança do banco é feita antes. Também deixa o número (#) e o nome de cada produto iguais aos do sistema da loja: quem tem o mesmo número fica com o nome do arquivo (o nome antigo fica anotado e os códigos dele continuam na busca), quem tem o mesmo nome passa para o número do arquivo com movimentações, saldo, fotos e NFs, e os novos entram com o número do arquivo. O que parece outra peça não muda e aparece numa lista para conferir."
    ]
  },
  {
    "version": "2.6.2",
    "date": "2026-10-19",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Publicação: a 2.6.1 não chegou a ser publicada porque o autoteste do instalador era barrado pela trava de segurança da 2.5.5. O autoteste agora se apresenta como o próprio computador. Esta versão traz tudo o que veio na 2.5.5, na 2.6.0 e na 2.6.1."
    ]
  },
  {
    "version": "2.6.1",
    "date": "2026-10-19",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Mudanca: Painel novo, em blocos: o que pede ação vem primeiro. No topo ficam quatro números que rolam até o valor (unidades em estoque, saídas em 30 dias, produtos com estoque e zerados), cada um com a linha dos últimos 30 dias. Logo abaixo, o bloco grande \"Pede ação hoje\" junta os zerados que venderam, os que estão perto de zerar e os parados que mais ocupam; clicar abre a ficha do produto. Em volta ficam a saúde do estoque (girando, lento e parado), o movimento da semana ou do mês, as mais saídas, o assistente e o WhatsApp, e as últimas movimentações, que entram sozinhas no topo. O Painel ficou com menos da metade da altura.",
      "Mudanca: Produtos: o código da peça aparece em destaque no começo de cada linha, com a marca e a versão em texto simples. O saldo fica grande à direita, o botão \"Movimentar\" sempre visível e as outras ações no menu \"⋯\". Filiais sem estoque somem da tabela, os filtros viraram botões (Todos, Com estoque, Zerados) e as linhas se reacomodam ao buscar.",
      "Mudanca: Ficha do produto: foto grande, saldo por filial (zero em cinza), um rótulo por mês no gráfico e as últimas 5 movimentações já visíveis. A foto e o código \"viajam\" da linha até a ficha.",
      "Mudanca: Movimentar: ao confirmar, o saldo da linha pisca em verde (entrada), laranja (saída) ou azul (transferência) e rola até o valor novo.",
      "Mudanca: Movimentações: uma linha por movimento, com o código, o tipo, o local e a quantidade. O estoque inicial aparece como \"Cadastro\", a movimentação estornada fica riscada e os botões ficam sempre visíveis.",
      "Mudanca: Lançar nota fiscal: a janela mostra as etapas (ler a chave, conferir os itens e confirmar), os itens aparecem um a um, o \"Fica\" rola até o valor e o nome do produto escolhido não é mais cortado.",
      "Mudanca: Assistente: a conversa aparece em balões, os códigos de peça viram etiquetas, a resposta aparece em sequência e três pontinhos mostram que ele está pensando.",
      "Mudanca: Leitura de código: na movimentação em lote e no celular, o item lido ganha uma moldura verde. O bipe ao ler pode ser ligado ou desligado (vem desligado).",
      "Mudanca: Relatórios > Análises: a distribuição por filial, os dias com mais movimento, para onde foram as saídas, o estoque por marca e versão e as transferências externas saíram do Painel e foram para cá.",
      "Correcao: Estorno: a lista de movimentações e a de produtos agora se atualizam logo depois de estornar."
    ]
  },
  {
    "version": "2.6.0",
    "date": "2026-10-19",
    "title": "Novidades e ajustes",
    "highlights": [
      "Novo: Visual novo \"Vidro suave\": fonte Sora, cartões de vidro translúcido, manchas de cor que se movem devagar no fundo, barra do topo flutuante e menu com uma pílula que desliza até a aba aberta. Vale para o app inteiro, no tema claro e no escuro.",
      "Novo: Animações: a troca de tela desliza de leve, os cartões aparecem em sequência e os números do Painel rolam até o valor.",
      "Novo: Nível de animação: em Configurações > Aparência > Animações dá para escolher Completo, Suave ou Nenhum. \"Nenhum\" também desliga o desfoque do vidro, para PCs mais fracos. Com os efeitos de animação do Windows desligados, o Chronos usa no máximo Suave.",
      "Mudanca: Cor principal: a cor padrão passa a ser azul-petróleo. Quem já tinha escolhido Índigo continua com ela.",
      "Mudanca: Biblioteca das telas atualizada para o Mantine 9."
    ]
  },
  {
    "version": "2.5.5",
    "date": "2026-10-18",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: PIN para aprovar pelo WhatsApp: em Assistente > Admin, o botão \"Criar PIN do WhatsApp\" define um PIN de 4 a 8 números. A partir de agora, aprovar ou recusar pelo WhatsApp é /aprovar 3 1234 (número da sugestão e PIN). Sem PIN, esses dois comandos ficam desligados. Cinco PINs errados seguidos bloqueiam por 10 minutos.",
      "Mudanca: Base oficial exige senha: o computador que publica a base só liga o servidor se tiver uma senha definida (a mesma nas outras máquinas). Cinco senhas erradas seguidas bloqueiam aquele computador por 5 minutos. A senha passa a ficar guardada protegida pelo Windows.",
      "Mudanca: Chaves do assistente protegidas: as chaves do Groq e do Gemini passam a ficar guardadas protegidas pelo Windows, e não mais em texto aberto. Nada muda para quem usa.",
      "Mudanca: Entradas sem o estoque inicial: o estoque cadastrado junto com um produto novo não conta mais como \"entrada\" no Painel, nos gráficos e nos números de entradas. O saldo continua certo.",
      "Mudanca: Textos e cores: acentos corrigidos em todo o app, nomes mais claros (\"Computador principal\", \"Lançar nota fiscal\", \"cópia do estoque\"), cinzas mais escuros para ler melhor, selos maiores, botões das linhas mais visíveis e laranja só para saída.",
      "Mudanca: Bibliotecas atualizadas (React 19.3, Mantine 8.3.18, FastAPI, cryptography e outras), sem mudança de uso.",
      "Correcao: Segurança: um site aberto no navegador do mesmo computador não consegue mais falar com o Chronos nem baixar o banco. Sugestões vindas de outras máquinas precisam da senha da base oficial. A chave do certificado digital não fica mais exposta durante a consulta à SEFAZ, e as respostas da SEFAZ e os downloads da base têm limites de tamanho e de tempo.",
      "Correcao: Linhas do Painel e das listas podem ser abertas pelo teclado (Tab e Enter)."
    ]
  },
  {
    "version": "2.5.4",
    "date": "2026-10-15",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Pesquisar na internet: a chave grátis do Gemini não tem cota para a pesquisa do Google e respondia \"limite de hoje\" já na primeira vez. Agora, quando o Gemini não libera, a pesquisa segue pelo Groq e a resposta diz qual dos dois pesquisou."
    ]
  },
  {
    "version": "2.5.3",
    "date": "2026-10-15",
    "title": "Novidades e ajustes",
    "highlights": [
      "Novo: Cópia dos backups em outro disco: em Backup > Backups locais dá para escolher uma pasta em outro disco (ex.: D:), pendrive ou rede. Cada backup também é copiado para lá, numa subpasta com o nome do computador, e os antigos saem de lá junto com os daqui. Se o disco do Chronos falhar, os backups continuam lá.",
      "Mudanca: Backup automático que ficou para trás: se o app estava fechado no horário (18h), o backup sai na próxima vez que o Chronos abrir, em vez de esperar o próximo horário.",
      "Mudanca: Menos cópias antigas do banco: das cópias feitas antes de atualizar, restaurar, aplicar a base oficial ou recuperar fotos, ficam só as 3 últimas de cada tipo; das cópias de migração (.bak ao lado do banco), as 3 últimas. Backups com outro nome (ex.: os feitos à mão) não são apagados.",
      "Mudanca: Um log só: o log do app fica na pasta do Chronos, junto com o do backend, e não passa de 1 MB. Os logs antigos em outras pastas são apagados."
    ]
  },
  {
    "version": "2.5.2",
    "date": "2026-10-15",
    "title": "Novas funcionalidades",
    "highlights": [
      "Novo: Ensinar respondendo: quando a IA não sabe se dois códigos são a mesma peça, ela pergunta. No app aparecem os botões Igual, Similar e Diferente (ou é só responder com a palavra). O admin logado ensina na hora; um colega manda para o admin aprovar.",
      "Novo: Pesquisar na internet, só quando pedir: no mesmo \"não sei\", o botão \"Pesquisar na internet\" (ou a palavra \"pesquisar\") traz o que a internet diz, com os links, marcado \"conferir\". Nunca vira regra sozinho: quem confirma é você. Usa o Gemini se a chave dele estiver salva; senão, a pesquisa do Groq.",
      "Novo: WhatsApp particular (\"Mensagem para mim\"): /perguntar faz qualquer pergunta sem envolver o cliente; /igual, /similar, /diferente e /pesquisar respondem a ela; /pendentes mostra o número das propostas e /aprovar ou /recusar decidem."
    ]
  },
  {
    "version": "2.5.1",
    "date": "2026-10-15",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Mudanca: WhatsApp: a resposta por veículo (\"Volvo FH 520 Euro 3\") vem no mesmo formato curto da consulta de estoque: o motor e o modelo da turbina em negrito e, embaixo, o código nosso com a quantidade em cada filial. No app, a resposta completa continua.",
      "Mudanca: Assistente: \"a 4031196 é a mesma que a 5455609?\" agora responde \"provavelmente servem\" quando os dois códigos estão em fichas diferentes do catálogo, mas do mesmo modelo Master Power e da mesma turbina (MP530w / HE500WG), em vez de \"não sei\". Continua pedindo para o especialista confirmar.",
      "Correcao: Baixa por NF-e logo depois de emitir a nota: quando o emissor guarda mais de um XML da mesma nota (o assinado, antes da resposta da SEFAZ, e o autorizado), o Chronos podia ler o primeiro e dizer \"O XML não tem a autorização da SEFAZ\". Agora ele usa sempre o XML autorizado. Se a nota ainda não foi autorizada, o aviso mostra qual arquivo foi lido e pede para buscar de novo.",
      "Correcao: Busca por veículo: uma palavra que não está no catálogo junto com as outras (\"Scania Super R460\") não zera mais a busca: a busca tira essa palavra e segue. Ano fora do catálogo (\"2023\" num veículo que o catálogo só tem até 2015) ganha o aviso \"Conferir\".",
      "Correcao: WhatsApp: a pergunta nova não usa mais mensagens de horas atrás da conversa (o código do áudio de outro pedido aparecia na resposta)."
    ]
  },
  {
    "version": "2.5.0",
    "date": "2026-10-15",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Cores e aparência: cada coisa tem sempre a mesma cor (entrada verde, saída laranja, transferência azul, ajuste cinza; nova azul, reman âmbar, montada roxo). Em Configurações > Aparência dá para escolher a cor do app (Índigo, Azul-petróleo ou Grafite), o tema e o modo compacto.",
      "Novo: Dashboard novo: cartões com mini gráfico e comparação com os 30 dias anteriores; gráfico único de movimento e saldo; para onde foram as saídas (por natureza); estoque por marca e versão (clique abre Produtos filtrado); saúde do estoque (girando, lento, parado) com os parados que mais ocupam; calendário das últimas 12 semanas.",
      "Novo: Produtos: foto pequena na lista, saldo colorido e as vendas dos últimos 90 dias em barrinhas. A ficha abre com a foto, o saldo colorido e o gráfico do saldo nos últimos 6 meses.",
      "Novo: Movimentações por dia: a lista vem agrupada por dia (Hoje, Ontem...), com faixa colorida e etiquetas; a tabela continua no botão \"Tabela\".",
      "Novo: Assistente: a resposta mostra o produto em cartão (foto, TEMOS, marca, versão, estoque por filial, \"Abrir produto\") e tem o botão \"Copiar resposta\".",
      "Novo: Acabamentos: 25, 50 ou 100 por página; números que correm quando mudam; telas vazias com um botão do que fazer; tecla \"?\" (ou o botão \"?\" no topo) mostra os atalhos do teclado.",
      "Correcao: \"Evolução do estoque\" não mostra mais saldo negativo."
    ]
  },
  {
    "version": "2.4.6",
    "date": "2026-10-15",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: PC reserva do robô do WhatsApp: conecte o WhatsApp da empresa também no PC de um colega (Assistente > Admin, com uma senha daquele PC). Ele só responde ao 🤖, aos comandos e manda o resumo quando o PC principal (o que publica a base) estiver desligado ou com o robô parado, como nas férias. Com os dois ligados, só o principal responde.",
      "Novo: \"Não se aplica\": na aba Catálogo do produto, marque a aplicação que o catálogo Master Power traz errada. A linha fica riscada, o assistente deixa de usá-la, e a marcação continua depois de atualizar o catálogo e vai para as outras máquinas.",
      "Correcao: Pergunta com a norma (\"Volvo FH 520 Euro 3\") trazia também a turbina só Euro 5. Agora a norma filtra: sai a aplicação de outra norma e fica a que não diz a norma."
    ]
  },
  {
    "version": "2.4.5",
    "date": "2026-10-15",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: A IA entende a mensagem: com a chave do Groq configurada, a IA lê toda pergunta (código, versão, veículo, motor, ano, \"essa\", \"aquela\") e o Chronos responde pelo estoque. Código que a IA inventar e não estiver na mensagem é ignorado; sem internet ou no limite gratuito, a busca segue como antes.",
      "Novo: Grafo de códigos: \"é igual?\" e as sugestões do \"Para revisar\" seguem o caminho entre os códigos (o mesmo produto cita os dois, o que o especialista ensinou, o item da NF-e do fornecedor), e a resposta mostra o caminho para conferir.",
      "Novo: Formato curto no WhatsApp: a consulta de estoque sai como \"Consulta Estoque\" com uma linha por versão e por filial (ex.: \"📍Canoas: 01 - 4031195\", \"📍Canoas: 00 - 4031195 MONTADA\"), sem a aplicação. No app, a resposta completa continua.",
      "Novo: Revisar antes de enviar (WhatsApp): com o modo ligado (padrão), a resposta do 🤖 não vai direto para o cliente. Ela aparece em Assistente > Admin > WhatsApp para editar, enviar ou descartar, e também na \"Mensagem para mim\", onde /enviar e /descartar resolvem pelo celular.",
      "Novo: \"Tem montada ou reman?\": o assistente responde cada versão pedida (nova, reman e montada), dizendo também quando não temos.",
      "Correcao: Código falado e transcrito errado (ex.: \"876271515151517\" no lugar de 876271-5017): o assistente sugere as turbinas Garrett com o mesmo começo, em vez de só dizer que não achou."
    ]
  },
  {
    "version": "2.4.4",
    "date": "2026-10-15",
    "title": "Novas funcionalidades",
    "highlights": [
      "Novo: Ignorar item da nota: na conferência da NF-e, marque \"Ignorar\" no item que não é estoque (ex.: CASCO, usado só para transportar a mercadoria). A nota é lançada sem ele, e o Chronos lembra: na próxima nota com o mesmo código, o item já vem marcado."
    ]
  },
  {
    "version": "2.4.3",
    "date": "2026-10-14",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Mudanca: Baixa por NF-e com natureza e observação: na conferência da nota, escolha a natureza (operação normal, transferência externa ou ajuste), o local externo e a observação antes de dar entrada ou saída. Nota da matriz ou de outra filial (mesma raiz de CNPJ) já vem como transferência externa.",
      "Mudanca: Na conferência da nota, cada item mostra o saldo de hoje e quanto fica no estoque depois da entrada ou da saída, também quando o produto é escolhido à mão.",
      "Correcao: Nota lançada com a natureza errada: estorne as movimentações dela e bipe de novo para lançar certo. Antes, a nota continuava marcada como \"já baixada\"."
    ]
  },
  {
    "version": "2.4.2",
    "date": "2026-10-14",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Baixa por NF-e: bipe o código de barras do DANFE (com o celular ou com o leitor) e o Chronos abre a conferência da nota com os itens já ligados aos produtos. Confira e clique em \"Dar saída\" ou \"Dar entrada\"; o estoque é movimentado com o documento \"NF número\". A mesma nota não pode ser lançada duas vezes, e nota cancelada é recusada. Também fica em Movimentações > \"Baixa por NF-e\".",
      "Novo: Notas de saída: o Chronos lê o XML nas pastas do emissor (Questor). As pastas ficam em \"Baixa por NF-e\" > Configurar.",
      "Novo: Notas de entrada (fornecedor): com o certificado digital A1 da empresa configurado, o Chronos baixa o XML da nota direto da SEFAZ. Em \"Baixa por NF-e\" > Configurar, informe o arquivo .pfx, a senha e o \"CNPJ desta loja\".",
      "Novo: O Chronos lembra qual produto você escolheu para cada item de cada fornecedor e sugere na próxima nota.",
      "Novo: Sugerir ao admin: na tela do Assistente, qualquer colega sugere \"este código é igual (ou similar, ou não serve) àquele\" pelo próprio Chronos. A sugestão chega na máquina que publica a base, em Assistente > Admin > Para revisar, e só vale depois que o admin aprova.",
      "Correcao: Leitor do celular sem câmera ao vivo: quando o navegador bloqueia a câmera (página sem https), aparece o botão \"TIRAR FOTO DO CÓDIGO\" e o Chronos lê o código pela foto."
    ]
  },
  {
    "version": "2.4.1",
    "date": "2026-10-13",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Ficha própria: na aba Catálogo do produto, cadastre as aplicações (montadora, veículo, motor, ano) e os outros códigos (OEM, antigos) de uma turbina que o catálogo Master Power não tem. O assistente passa a achar a turbina por eles, e a ficha vai para as outras máquinas junto com o conhecimento do assistente.",
      "Novo: Atualizar catálogo: em Backup > Catálogo, escolha o arquivo novo da Master Power e o Chronos atualiza as fichas nesta máquina, sem esperar uma versão nova.",
      "Correcao: \"Atualização incompleta\" depois de atualizar: o serviço da versão anterior podia continuar aberto e segurar a porta do Chronos. Agora o Chronos fecha esse serviço sozinho ao abrir, e a atualização fecha o serviço antes de instalar.",
      "Correcao: Na tela \"Atualização incompleta\", o botão agora reinicia o Chronos e fecha o serviço antigo.",
      "Correcao: Fechar o Chronos não pisca mais uma janela de prompt várias vezes.",
      "Correcao: Imprimir (etiquetas, NF-e e folha de inventário) não abre mais uma página em branco antes da impressão de verdade.",
      "Correcao: Turbina nova (ou renomeada) já aparece ligada ao catálogo na hora. Antes só ligava na próxima abertura do Chronos, e o assistente não a achava pela busca por veículo."
    ]
  },
  {
    "version": "2.4.0",
    "date": "2026-10-13",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Assistente de IA (aba Assistente): pergunte pelo código da peça, pelo veículo ou motor (\"scania 440\", \"fh d13 2015\"), se duas peças são iguais, quando ela saiu ou chegou e qual é o código Master Power. A resposta vem do estoque. A IA gratuita só entra quando a busca direta não entende a pergunta.",
      "Novo: Código de outro fabricante: mande um código OEM, Mahle, Biagio, Master Power ou de outra marca do catálogo e o assistente diz de que turbina é e quais delas temos.",
      "Novo: Conhecimento do especialista: o admin ensina o que é igual, similar ou não serve. A lista \"Para revisar\" mostra os códigos perguntados que ainda não têm resposta, e o que é ensinado chega sozinho às outras máquinas.",
      "Novo: WhatsApp em modo copiloto: responde só quando alguém da equipe reage com 🤖 na mensagem do cliente. Entende áudio e foto da plaqueta e tem os comandos /ensinar, /pendentes e /resumo.",
      "Novo: Foto da plaqueta no chat e resumo diário na \"Mensagem para mim\" (o que zerou, o que mais saiu e o que pediram e não temos).",
      "Novo: Movimentação rápida: tecla N no produto sob o mouse ou selecionado. A busca rápida (Ctrl+K) mostra o saldo por filial.",
      "Novo: Movimentações: filtro pelo número do documento (NF).",
      "Novo: Senha no servidor local da base oficial, a mesma em todas as máquinas.",
      "Mudanca: Dashboard: filiais com um local só ficam escondidas e os itens perto de zerar aparecem em destaque.",
      "Mudanca: Produto com movimentações não pode mais ser excluído: a tela oferece inativar, e o histórico fica guardado.",
      "Mudanca: Janela do aplicativo com proteção extra e permissões mínimas.",
      "Correcao: \"Salvar configuração\" da Base oficial voltou a funcionar."
    ]
  },
  {
    "version": "2.3.0",
    "date": "2026-10-09",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Nova interface: visual limpo e profissional em todas as telas, com tema claro e escuro revisados e fonte Inter embutida (funciona offline).",
      "Novo: Navegação por abas no topo: a barra lateral saiu. As 6 telas do dia a dia viram abas (atalhos Alt+1 a Alt+6) e a administração fica no menu de engrenagem.",
      "Novo: Busca rápida (Ctrl+K): encontre produtos ou vá direto para qualquer tela.",
      "Novo: Ficha de catálogo no produto: especificações, referências cruzadas e aplicações, com códigos copiáveis em um clique.",
      "Mudanca: Telas do dia a dia: Produtos com tabela mais limpa e estoque por filial; Dashboard com cores acessíveis e cor fixa por filial; Movimentações com quantidade +/− e filtros em uma linha; Inventário com cards clicáveis e diferença faltando/sobrando; Etiquetas com abas Estoque e Expedição (NF-e) e seleção em lote.",
      "Mudanca: Telas administrativas: Relatórios, Backup, Comparar estoques, Importar e demais telas reorganizados no mesmo padrão, com o tema claro corrigido na Importação. O vermelho fica reservado para ações destrutivas e erros reais.",
      "Correcao: Recarregar a tela (F5) agora mantém a tela atual. Antes, sempre voltava para o Dashboard.",
      "Correcao: Etiquetas: busca, filtros, itens selecionados e cópias são mantidos ao trocar de aba ou recarregar.",
      "Correcao: Produtos: o filtro \"Com estoque\" agora busca no cadastro inteiro, e não só na página atual, com total e paginação corretos.",
      "Correcao: Leitor de código: ler a etiqueta impressa (CI-<id>) em Produtos agora abre o produto direto. Antes, a busca ficava vazia.",
      "Correcao: Busca rápida (Ctrl+K): agora abre com o cursor dentro de um campo de texto, e \"Histórico\" leva à tela certa.",
      "Correcao: Janelas menores e troca de abas: Movimentações cabe em 1024 px sem esconder as ações, as abas abrem sem a tela \"Carregando\" e a nova sessão de inventário já vem com o Local preenchido."
    ]
  },
  {
    "version": "2.2.3",
    "date": "2026-08-17",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Vínculos Visuais/Fiscais: Agora é possível vincular um produto a outro (ex: Turbina Montada apontando para um Conjunto Central) para controle visual e facilitar processos fiscais.",
      "Novo: Novo Modal de Vínculos com busca inteligente de produtos para criar ou remover relação Pai/Filho.",
      "Novo: Coluna \"Vínculos\" na listagem de produtos com atalho para abrir o novo modal.",
      "Novo: Cadastro de Produtos agora permite informar manualmente o \"Nº do Documento (NF)\" e \"Observação\" para a movimentação automática de Estoque Inicial.",
      "Correcao: Exclusão de produtos foi corrigida para limpar o histórico de movimentações e desvincular automaticamente produtos dependentes, evitando erro de integridade no banco.",
      "Correcao: Correção de cor do selo (Badge) no modal de Vínculos para ter melhor contraste com fundo no Modo Escuro.",
      "Correcao: Hotfix: Correção da migração de banco de dados (erro \"Database error\" ao carregar produtos após atualizar direto da versão 2.2.1)."
    ]
  },
  {
    "version": "2.1.2",
    "date": "2026-06-12",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Desbloqueio do Cache da Interface: Implementada a destruição total e forçada do cache antigo (Zombie Service Worker). Agora o aplicativo irá desregistrar automaticamente qualquer cache que tenha ficado preso nas máquinas durante o update da versão 2.1.1 e forçará a tela a recarregar imediatamente com o design mais atualizado."
    ]
  },
  {
    "version": "2.1.1",
    "date": "2026-06-12",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Cache de Atualização (Service Worker): Removido o sistema agressivo de Service Worker introduzido na versão 2.0.0. Como o Tauri já carrega os arquivos do próprio disco com latência zero, o Service Worker era redundante e estava impedindo as novas interfaces de aparecerem automaticamente após as atualizações. O aplicativo passará a deletar os caches antigos e exibir as atualizações instantaneamente."
    ]
  },
  {
    "version": "2.1.0",
    "date": "2026-06-11",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Funcionalidade de Estorno nativa. Agora é possível estornar movimentações erradas diretamente pela tabela de histórico ou formulário, revertendo o estoque e mantendo o registro auditável.",
      "Novo: Aba de Configurações centralizada. Organização em blocos visuais, com opções de backup, banco de dados, atualização e etiquetas unificadas em uma única tela.",
      "Mudanca: Banho de loja no sistema inteiro. A interface foi completamente redesenhada com visual premium, cards flutuantes, tons modernos e animações fluídas.",
      "Correcao: Corrigido o envio do ID de referência (movimento_ref_id) em formulários de estorno manual e ajustes nas validações do backend."
    ]
  },
  {
    "version": "2.0.4",
    "date": "2026-06-10",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Botão de Atualização: Resolvido bug persistente onde o botão \"Verificar Atualização\" sumia em compilações finais do Tauri v2 devido a mudanças no escopo global das variáveis internas."
    ]
  },
  {
    "version": "2.0.3",
    "date": "2026-06-10",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Atualizador do Sistema (Updater): Resolvido problema em que arquivos do motor (estoque_backend.exe) ficavam travados em segundo plano, impedindo a atualização correta no Windows. Agora o sistema força o encerramento completo do motor antes de instalar e ao clicar no \"X\" para fechar.",
      "Correcao: Recriação de Locais: Ao tentar recriar um local que havia sido inativado (soft-delete), o sistema agora reativa o local antigo com os novos dados, em vez de retornar erro de duplicidade.",
      "Correcao: Botão de Atualização Invisível: Corrigido bug de detecção do ambiente Tauri v2 (__TAURI_INTERNALS__) que impedia a exibição do botão \"Verificar update\" no HeaderBar."
    ]
  },
  {
    "version": "2.0.2",
    "date": "2026-06-10",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Hotfix de Mapeamento: Correção da migração v2.0.1 que trocava estoques se os locais tivessem sido criados manualmente com IDs diferentes da ordem original.",
      "Correcao: Remoção de Locais: Locais inativados agora somem corretamente da visualização e cálculos do Dashboard.",
      "Correcao: Botão de Atualização: O botão \"Verificar update\" agora fica visível mesmo em ambientes de teste/desenvolvimento."
    ]
  },
  {
    "version": "2.0.1",
    "date": "2026-06-10",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Correcao: Hotfix Urgente: Resgate de dados de estoque que não apareciam para clientes originários da versão 1.6.4 após atualização."
    ]
  },
  {
    "version": "2.0.0",
    "date": "2026-06-10",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Suporte completo ao Tauri v2.0, com refatoração estrutural que pavimenta o caminho para o aplicativo Mobile (Android/iOS nativo) no futuro.",
      "Novo: Suporte Offline-First Extremo (Latência Zero) usando Service Workers (vite-plugin-pwa) para carregar a interface da memória cache quase que instantaneamente.",
      "Novo: Seleção dinâmica de cores individuais para cada local/filial no gráfico de pizza do Dashboard, salva no navegador.",
      "Mudanca: Overhaul total de UX/UI com a estética \"Premium Spotify\": Efeito de Vidro Fosco (Glassmorphism) no cabeçalho e menu, sombras táteis nos cards e reações suaves ao passar o mouse nas linhas de tabela.",
      "Mudanca: Transições de tela agora usam físicas de mola (Spring animations) via Framer Motion, removendo o fade engessado por uma navegação extremamente fluida.",
      "Mudanca: Pipeline de CI/CD limpo e otimizado: remoção de scripts antigos de injeção de WebView2, pois o instalador do Tauri v2 agora gerencia o WebView de forma nativa e segura.",
      "Correcao: Correção de quebra de layout no gráfico de \"Distribuição atual de estoque\" onde os nomes dos locais compridos e as porcentagens eram cortados da tela."
    ]
  },
  {
    "version": "1.6.4",
    "date": "2026-04-28",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: A tela Backup agora exibe cards de visao geral para separar melhor backup local, base oficial, servidor local e situacao operacional.",
      "Novo: Comparar estoques ganhou secoes mais claras para comparacao por servidor e comparacao manual, com destaque explicito para o snapshot latest.",
      "Mudanca: Movimentacoes, Relatorios e Etiquetas foram reorganizadas em componentes e hooks menores, reduzindo acoplamento e facilitando manutencao futura.",
      "Mudanca: Servicos de backup, base oficial, comparacao, estoque e movimentacao foram divididos por responsabilidade, deixando o backend mais modular e previsivel.",
      "Mudanca: README_RELEASE.md foi atualizado para refletir o fluxo real de release, incluindo release:doctor, sidecar e validacoes antes do push.",
      "Correcao: Corrigidos trechos com encoding quebrado em modulos legados e arquivos de configuracao que ainda exibiam textos inconsistentes.",
      "Correcao: Ajustado o contraste de selecao e tooltips no modo escuro do dashboard, evitando blocos brancos dificeis de ler.",
      "Correcao: Polimentos em Backup e Comparar estoques deixaram o estado visual e a leitura operacional mais confiaveis no uso diario."
    ]
  },
  {
    "version": "1.6.3",
    "date": "2026-04-24",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: A tela Comparar estoques agora exibe historico local de snapshots de comparacao, com exclusao do snapshot atual e exclusao de itens individuais do historico pela propria interface.",
      "Novo: Comparar estoques passou a mostrar status operacional mais claro do servidor local e do servidor remoto, incluindo porta, ultima confirmacao e indicacao explicita de uso do snapshot latest.",
      "Mudanca: Backend passou a usar lifespan no FastAPI e reorganizou servicos de base oficial, comparacao, inventario e analytics para separar melhor configuracao, publicacao, historico, validacao e aplicacao.",
      "Mudanca: Paginas Backup, Produtos e Inventario foram fracionadas em componentes e hooks menores, reduzindo acoplamento e deixando o frontend mais seguro para evoluir.",
      "Mudanca: Dashboard e comparativo tiveram melhor divisao de componentes/chunks pesados, deixando o build mais saudavel e a manutencao mais previsivel.",
      "Correcao: Correcao do startup do backend local apos o refactor da base oficial, evitando o erro Servico local indisponivel ao abrir o app em desenvolvimento.",
      "Correcao: Historico de snapshots de comparacao agora aplica retencao automatica, reduzindo acumulo de arquivos antigos e confusao operacional.",
      "Correcao: Fluxo legado baseado em StockMovement foi removido junto com trechos mortos e textos antigos inconsistentes nos modulos refatorados."
    ]
  },
  {
    "version": "1.6.2",
    "date": "2026-04-15",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: A tela Comparar estoques agora preserva o ultimo resultado da analise durante a sessao do app, evitando repetir a comparacao ao trocar de aba.",
      "Mudanca: Controle do servidor local em Backup > Base oficial passou a usar um switch on/off, com atualizacao imediata do status e confirmacao real apos ligar ou desligar.",
      "Correcao: Correcao do estado compartilhado do servidor local, evitando falso Servidor parado e o erro de Servidor nao confirmou inicializacao logo apos iniciar.",
      "Correcao: Cards da area Base oficial compartilhada agora respeitam corretamente o modo escuro e nao ficam mais com fundo branco no tema dark.",
      "Correcao: Resultado do comparativo de estoques deixa de sumir ao sair da aba, permanecendo visivel ate reiniciar o app ou executar uma nova verificacao."
    ]
  },
  {
    "version": "1.6.1",
    "date": "2026-04-14",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo bloco Transferencias externas na dashboard, com foco exclusivo em TRANSFERENCIA_EXTERNA e filtro entre Entradas externas e Saidas externas.",
      "Mudanca: Dashboard passou a mostrar transferencias externas em um formato mais operacional, combinando grafico e tabela com opcao de Ver mais.",
      "Mudanca: Busca de Produtos e de Ativar/Inativar Itens agora aceita #ID para localizar diretamente pelo ID interno, preservando numero puro para buscar codigo/nome da peca.",
      "Correcao: Busca numerica deixou de misturar o ID interno com o codigo da peca, reduzindo resultado ambiguo no dia a dia.",
      "Correcao: Consulta de transferencias externas na dashboard agora respeita corretamente o escopo selecionado usando origem para SAIDA e destino para ENTRADA."
    ]
  },
  {
    "version": "1.6.0",
    "date": "2026-04-14",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo fluxo de servidor local para distribuir a base oficial na rede, com botoes para iniciar/parar o host, publicar a base atual e baixar a base de outra maquina pelo endereco do servidor.",
      "Novo: Novo fluxo de comparacao por servidor remoto: cada maquina pode publicar um snapshot local e outra maquina compara informando apenas o endereco do host, sem copiar .db manualmente.",
      "Novo: Novo tema claro/escuro com alternancia no topo do app e preferencia salva localmente.",
      "Novo: Nova exportacao Resumo bonito de estoque em XLSX, com abas Resumo e Estoque, totais por local (Canoas e PF) e total global de pecas.",
      "Mudanca: Tela Backup > Base oficial foi reorganizada para priorizar o modo servidor, mantendo o fluxo mais natural de ligar servidor -> publicar -> outro PC conecta -> baixa.",
      "Mudanca: Tela Comparar estoques passou a priorizar comparacao por servidor remoto e manteve a comparacao manual apenas como modo avancado.",
      "Mudanca: Dashboard ficou mais operacional: o bloco inutil de Itens sem movimentacao saiu e entrou Zerados com venda recente, focado em itens ativos sem saldo e com venda real no periodo.",
      "Mudanca: Fluxo visual do app ficou mais limpo com reorganizacao da navegacao, abas em telas grandes e rolagem propria na barra lateral para nao esconder secoes administrativas.",
      "Correcao: Correcao do fluxo de distribuicao/comparacao entre maquinas para nao depender mais de pasta compartilhada UNC ou de copiar o banco manualmente para a rede.",
      "Correcao: Backup > Base oficial agora permite excluir a base publicada atual e snapshots historicos diretamente pela interface.",
      "Correcao: Exportacao de Resumo bonito passou a exibir mensagem mais clara quando o backend local estiver desatualizado em relacao ao frontend."
    ]
  },
  {
    "version": "1.5.0",
    "date": "2026-04-13",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo Relatorio de itens selecionados, com busca de produtos, selecao manual de itens e PDF mostrando Canoas, PF, Total e Onde tem.",
      "Novo: Novo fluxo de Comparacao publicada na rede: cada maquina pode publicar um snapshot da propria base e outra maquina pode comparar escolhendo essa base na lista.",
      "Novo: Novo bloco de Comparacao manual mantido como plano B na tela de comparativo, para comparar dois arquivos especificos quando necessario.",
      "Mudanca: Tela Comparar estoques passou a priorizar o fluxo mais simples de snapshots publicados em rede, reaproveitando a mesma pasta compartilhada ja usada pela base oficial.",
      "Mudanca: Pagina de Produtos ganhou ordenacoes operacionais por Maior/Menor estoque total, Maior/Menor quantidade em Canoas e Maior/Menor quantidade em PF.",
      "Mudanca: Lista de itens escolhidos para relatorio continua respeitando a ordem montada pelo usuario na hora de gerar o PDF.",
      "Correcao: Fluxo de comparacao entre bases deixou de depender da copia manual do .db para uma segunda pasta compartilhada em cada uso.",
      "Correcao: Endpoint de relatorio agora aceita selecao explicita de produtos por ID, reduzindo risco de imprimir itens fora da lista desejada."
    ]
  },
  {
    "version": "1.4.0",
    "date": "2026-04-07",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo release:doctor no fluxo de release para validar versoes, changelog e sidecar antes de gerar/publicar a nova versao.",
      "Novo: Historico e teste da pasta em Base oficial compartilhada, com comparativo entre a base local ativa e a ultima base publicada.",
      "Novo: Novas acoes de inventario para Fechar sessao e Excluir sessao, com confirmacao na interface.",
      "Novo: Novos relatorios em PDF de Vendas reais e Estoque parado.",
      "Mudanca: Tela de inventario ficou mais operacional: resumo claro de divergencias, filtros por status, atalhos (Ctrl+F, Ctrl+B, Ctrl+S) e persistencia de filtros na sessao.",
      "Mudanca: TRANSFERENCIA_EXTERNA passou a ser aceita tambem em ENTRADA, permitindo registrar recebimento de mercadoria vinda de filial/matriz com Local externo.",
      "Mudanca: Fluxo de release no GitHub Actions agora executa validacoes previas para reduzir chance de publicar versao quebrada.",
      "Correcao: Bloqueio preventivo de release quando o backend sidecar estiver desatualizado em relacao ao app.",
      "Correcao: Publicacao da base oficial ficou mais segura, com leitura mais clara da base ativa e menor risco de distribuir banco errado ou vazio.",
      "Correcao: Sessoes de inventario fechadas nao podem mais ser editadas, e sessoes com ajustes aplicados nao podem ser excluidas."
    ]
  },
  {
    "version": "1.3.0",
    "date": "2026-04-06",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Nova area de Base oficial compartilhada em Backup, com fluxo de publisher/consumer para publicar uma base oficial e atualizar outras instalacoes locais pela pasta compartilhada.",
      "Novo: Publicacao da base oficial com manifesto (base_oficial.json), checksum, historico de snapshots e backup automatico antes de aplicar a base em outra maquina.",
      "Novo: Resumo visivel da base ativa antes de publicar, mostrando caminho do banco, quantidade de produtos, itens com estoque, movimentacoes e tamanho do arquivo.",
      "Novo: Botao Remover na tela de Estoques para excluir perfis locais cadastrados com confirmacao e limpeza da pasta do perfil.",
      "Mudanca: Cadastro de produto com estoque inicial agora gera movimentacoes reais de ENTRADA por local (Canoas e/ou PF), fazendo o item aparecer corretamente no grafico de fluxo.",
      "Mudanca: Top 5 saidas no periodo passou a considerar somente vendas reais (SAIDA com natureza OPERACAO_NORMAL).",
      "Mudanca: Consulta de itens sem movimentacao ficou mais fiel ao periodo consultado, ignorando movimentos futuros na apuracao historica.",
      "Correcao: Correcao do risco de publicar uma base vazia por engano ao usar ambiente de desenvolvimento diferente da base principal.",
      "Correcao: Bloqueio de exclusao para perfil Principal/default e para o perfil atualmente ativo.",
      "Correcao: Ajustes de robustez no fluxo de distribuicao da base oficial, com validacao de versao minima do app e restauracao segura em caso de falha."
    ]
  },
  {
    "version": "1.2.7",
    "date": "2026-04-02",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Botao Ajustar altura ao texto no editor visual de etiquetas para reduzir corte em fontes maiores.",
      "Mudanca: Dashboard passou a respeitar o escopo selecionado (Ambos, Canoas ou Passo Fundo) nos cards, distribuicao, evolucao e itens sem movimentacao.",
      "Mudanca: Datas da interface foram padronizadas para locale pt-BR.",
      "Mudanca: Compatibilidade entre endpoints novos e legados de analytics foi reforcada para manter frontend e backend alinhados durante update.",
      "Correcao: Tooltip do grafico de fluxo corrigido: a serie verde agora aparece como Entradas.",
      "Correcao: Erros simultaneos do dashboard agora sao consolidados em um unico aviso, evitando spam de notificacoes.",
      "Correcao: Consulta de top saidas e rota legada de distribuicao de estoque foram corrigidas para evitar falhas no dashboard e nos testes da API."
    ]
  },
  {
    "version": "1.2.6",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Reinicio hardening no desktop: verificacao de liberacao da porta 8000 antes de reabrir o app.",
      "Mudanca: Fluxo de restart_app agora faz tentativa forcada de encerramento do sidecar (taskkill) quando o processo permanece ativo.",
      "Correcao: Correcao definitiva do loop de \"reinicio pendente\" quando estoque_backend.exe fica preso no gerenciador de tarefas."
    ]
  },
  {
    "version": "1.2.5",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Comando nativo de reinicio controlado no desktop (restart_app) para fechar o sidecar antes do relaunch.",
      "Mudanca: Botao de reinicio em Estoques e no aviso de reinicio pendente passou a usar fluxo unico de reinicializacao.",
      "Correcao: Correcao do loop de \"reinicio pendente\": o app agora encerra o sidecar antes de reiniciar, evitando conflito de porta 8000."
    ]
  },
  {
    "version": "1.2.4",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Isolamento de contexto por estoque ativo no frontend, com profileScopeKey para separar cache/queries por perfil.",
      "Novo: Error boundary global no app para reduzir impacto de falhas de renderizacao e evitar tela branca total.",
      "Novo: Lazy loading das rotas principais com fallback de carregamento para melhorar percepcao de performance.",
      "Mudanca: Consultas de Dashboard, Produtos e Movimentacoes passaram a incluir escopo do estoque ativo nas query keys.",
      "Mudanca: Header e layout agora exibem estoque ativo e estado de reinicio pendente de forma mais clara.",
      "Mudanca: Prefetch da sidebar passou a considerar o perfil ativo para evitar dados cruzados entre estoques.",
      "Correcao: Limpeza de estados de aba e cache antigo ao trocar estoque ativo, reduzindo inconsistencias apos alternancia.",
      "Correcao: Tratamento explicito de erro nas listagens e historicos de Produtos/Movimentacoes (com acao de tentar novamente).",
      "Correcao: Maior robustez no fluxo de troca de perfil com invalidadacao de dados de escopo do frontend."
    ]
  },
  {
    "version": "1.2.3",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Protecao de renderizacao na tela de Movimentacoes para evitar tela branca total em caso de erro inesperado.",
      "Novo: Cobertura de teste para reativacao do estoque Principal/default no ciclo de perfis.",
      "Mudanca: Tabela de Movimentacoes com layout adaptativo (Auto/Compacto/Detalhado) e preferencia persistida entre sessoes.",
      "Mudanca: Coluna de observacao em Movimentacoes voltou ao modo de linha unica com reticencias para melhor estabilidade.",
      "Correcao: Correcao no backend para permitir ativar novamente o estoque default sem erro de \"ID reservado\".",
      "Correcao: Mensagem de erro da tela Estoques ficou mais clara quando o app estiver com backend antigo.",
      "Correcao: Ajustes de robustez no salvamento de preferencias da tela de Movimentacoes para evitar falhas em runtime."
    ]
  },
  {
    "version": "1.2.2",
    "date": "2026-02-20",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Nova tela Etiquetas com geracao e impressao em lote (selecao multipla, copias por item e codigo de barras CI-<id>).",
      "Novo: Acao rapida em Produtos para abrir a geracao de etiqueta de um item especifico.",
      "Novo: Nova tela Estoques para criar e alternar perfis de base local (multiplos estoques no mesmo app).",
      "Novo: Novos endpoints de sistema para perfis de estoque: listar, criar e ativar (/sistema/estoques e /sistema/estoques/ativo).",
      "Novo: Fluxo de inventario por modo bip com coletor, incremento configuravel e log de leituras.",
      "Mudanca: Inventario agora foca no fluxo operacional por leitura de etiqueta (iniciar modo bip, zerar fisico e contar item a item).",
      "Mudanca: Sidecar do desktop passa a respeitar CHRONOS_APP_DIR quando definido, facilitando cenarios de teste/operacao controlada.",
      "Mudanca: Nova rota legada /entrada-nf redireciona para Produtos para evitar tela quebrada.",
      "Correcao: Ajuste no prefetch da tela de status de produtos para manter filtros de estoque consistentes.",
      "Correcao: Mensagens mais acionaveis quando funcionalidades exigem backend atualizado (ex.: tela de Estoques).",
      "Correcao: Testes de API cobrindo ciclo de vida dos perfis de estoque (listar, criar e ativar)."
    ]
  },
  {
    "version": "1.2.1",
    "date": "2026-02-19",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Filtro de estoque na aba Ativar/Inativar com opcoes: Todos, Com estoque (> 0) e Sem estoque (= 0).",
      "Novo: Suporte a agendamento semanal no backup automatico, com dia da semana configuravel.",
      "Mudanca: Endpoint /produtos/gestao-status passou a aceitar o parametro has_stock para combinar status + busca + estoque.",
      "Mudanca: Tela de backup passou a permitir escolha de frequencia (Diario ou Semanal) e dia da semana quando semanal.",
      "Correcao: Correcao no fluxo de triagem para localizar itens inativados que ainda possuem saldo em estoque.",
      "Correcao: Scheduler de backup semanal agora ignora dias fora da configuracao e evita dupla execucao no mesmo dia."
    ]
  },
  {
    "version": "1.2.0",
    "date": "2026-02-19",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Backup automatico agendado com configuracao de hora/minuto e retencao por dias (7/15/30).",
      "Novo: Botao de \"Testar restauracao\" para validar backup em ambiente temporario sem tocar no banco ativo.",
      "Novo: Acao de rollback de dados pre-update (criacao de snapshot antes do update e restauracao assistida em caso de falha).",
      "Novo: Modulo de inventario com sessao de contagem, divergencia automatica e aplicacao de ajustes em lote.",
      "Novo: Tela \"Novidades\" no app com historico de versoes e highlights da release.",
      "Novo: Nova aba \"Ativar/Inativar\" para gestao rapida de status em lote (busca, filtro e selecao multipla).",
      "Mudanca: Ajuste de estoque agora exige motivo padronizado e observacao obrigatoria.",
      "Mudanca: Fluxo de update do app passou a criar backup pre-update antes de instalar.",
      "Mudanca: Mensagens de validacao ficaram mais amigaveis para usuario final (menos erros genericos).",
      "Mudanca: Historicos de movimentacao exibem motivo de ajuste.",
      "Mudanca: Produtos inativos deixaram de aparecer na listagem principal e nos graficos/indicadores de estoque.",
      "Correcao: Erro generico \"Invalid request\" substituido por mensagens mais acionaveis para casos comuns de validacao."
    ]
  },
  {
    "version": "1.1.5",
    "date": "2026-02-18",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Sem notas detalhadas para esta versao.",
      "Mudanca: Atualizacao de versao sem mudancas funcionais relevantes registradas no changelog historico.",
      "Correcao: Ajustes gerais de empacotamento e estabilidade sem notas tecnicas detalhadas preservadas."
    ]
  },
  {
    "version": "1.1.4",
    "date": "2026-02-18",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Mudanca: Processo de release com release:bump e checklist tecnico em README_RELEASE.md.",
      "Correcao: Bloqueio de compatibilidade quando frontend e backend estao em versoes incompativeis.",
      "Correcao: Validacao de versao no CI/release para evitar publicar artefatos fora de sincronia.",
      "Correcao: Regras de movimentacao com natureza/documento/referencia para reduzir erros de validacao."
    ]
  }
];

export function normalizeVersion(version: string): string {
  return (version || "").trim().replace(/^v/i, "");
}

export function getReleaseEntry(version: string): ReleaseEntry | undefined {
  const normalized = normalizeVersion(version);
  return RELEASE_ENTRIES.find((entry) => normalizeVersion(entry.version) === normalized);
}

export function getLatestReleaseEntry(): ReleaseEntry | undefined {
  return RELEASE_ENTRIES[0];
}
