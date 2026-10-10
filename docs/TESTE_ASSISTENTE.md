# Roteiro de teste — Assistente de IA

Para o dono do projeto testar o assistente no computador de desenvolvimento, com o
**banco de teste** (dados fictícios). Plano completo em `docs/PLANO_IA.md`.

Pastas:
- **principal** = `ChronosInventory` (branch `feature/assistente-ia`): backend mais novo, chave do Groq salva.
- **Antigravity** = `ChronosInventory-ag` (branch `ag/assistente-chat`): telas do assistente.

---

## 0. Preparação (uma vez)

Na pasta principal:

```powershell
C:\dev\chronos-venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

O banco de teste fica em `%TEMP%\chronos_assistente` (já criado). Se um dia precisar recriar:
`scripts\assistente_dev.py gerar-banco --substituir` (o banco novo já vem com uma regra de
exemplo: 53279887101 similar à 53279887116).

**Feche o Chronos instalado** antes do passo B: ele usa a porta 8000.

---

## A. WhatsApp no celular (sem as telas)

Na pasta principal:

```powershell
C:\dev\chronos-venv\Scripts\python.exe scripts\assistente_dev.py whatsapp
```

1. O QR code abre numa **janela do navegador**, que se atualiza sozinha (o código muda a cada
   ~20 s). No celular: WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho, e
   escaneie. Quando conectar, a página mostra "Conectado ✅" e o terminal mostra os próximos passos.
   Se a página disser "O QR code expirou", rode o comando de novo. Depois da primeira vez a
   conexão fica salva e não pede QR de novo, a não ser que o aparelho seja removido no celular:
   aí o comando avisa ("foi tirado dos aparelhos conectados") e, rodando de novo, abre um QR novo.
2. Na conversa **"Mensagem para mim"**: mande `805314`, depois um **áudio** "temos essa daí?",
   e **reaja com 🤖 no áudio**. A resposta chega citando o áudio.
3. **Responda** (arrastando para o lado) qualquer mensagem com "teste". Serve só para o registro:
   mostra como o WhatsApp oficial monta uma citação.
4. Mande `/ajuda`, `/pendentes` e `/ensinar 53279887101 similar 53279887116 teste`.
5. Ctrl+C para sair. Só quando terminar **todos** os testes, remova o aparelho conectado no
   celular ("Neonize" nas conexões antigas, "Chronos" nas novas); depois disso precisa de QR de novo.

O que conferir: o áudio foi entendido? A resposta veio certa, no formato do WhatsApp e
**citando a mensagem**? O 🤖 **sumiu**? O registro do teste fica em
`%TEMP%\chronos_assistente\whatsapp_dev.log` (endereços mascarados, sem os textos).

**Testes (2026-10-09):** no primeiro, resposta, áudio e `/ajuda` ok, mas a resposta veio sem
citar a mensagem e o 🤖 não saiu. Corrigido; no segundo teste, **tudo ok**: a resposta cita o áudio,
o 🤖 sai, e o código falado no áudio é entendido ("532-7988-7101" → 53279887101). Números longos
aparecem em verde na resposta porque o WhatsApp acha que são telefones; é do próprio WhatsApp.

---

## B. App no navegador (chat, configurações e área do admin)

**Terminal 1 — backend** (pasta principal):

```powershell
$env:CHRONOS_APP_DIR = "$env:TEMP\chronos_assistente"
C:\dev\chronos-venv\Scripts\python.exe -m backend.app.main
```

Sem o `CHRONOS_APP_DIR`, o backend cria um banco **vazio** na pasta do projeto.

**Terminal 2 — telas** (pasta do Antigravity):

```powershell
cd ..\ChronosInventory-ag\frontend
npm run dev
```

Abra **http://localhost:5173** e vá em **Assistente**.

1. **Chat:** "temos turbina 4031196?", "temos turbina do scania 440?", depois responda "dc13".
   Código e veículo/motor são respondidos pela busca direta, na hora e sem gastar o limite
   gratuito. O selo "Busca direta (sem IA)" só aparece quando a IA falhou. Para ver a IA,
   pergunte algo fora do padrão, ex.: "qual a capital da frança?".
2. **Configurações > Assistente de IA:** deve mostrar Groq, configurado (a chave já está salva).
   Teste trocar para "Sem IA (só busca direta)" e voltar.
3. **Tornar esta máquina admin:** tela **Backup > Base oficial**, na configuração,
   "Papel desta máquina" = **Publica a base**, e salve. Não precisa publicar nada.
4. **Assistente > Admin:** criar a senha de admin e entrar.
5. **Fluxo de ensinar** (o seu exemplo da 7210):
   - no chat, pergunte "tem a 53279887210?" → "não temos esse código" (e a ficha K27 do catálogo);
   - Admin > **Para revisar**: aparece a 53279887210 com a sugestão *TURBO K27 - 53279887116*;
   - clique **"É similar"** e escreva "muda o atuador";
   - no chat, pergunte "tem a 988-7210?" (só o final) → deve entender como 53279887210 e
     oferecer a K27 como similar.
6. **Conhecimento:** a regra aparece; exclua e veja o chat deixar de oferecer a K27. A linha de
   status em cima diz "Publicado só nesta máquina..." com um aviso: em casa é o normal (não há
   pasta compartilhada nem servidor ligado; isso é a parte D, na empresa).
7. **Histórico:** as conversas aparecem; corrija uma resposta; exporte o JSONL.
8. **WhatsApp** (aba dentro do Admin). **Feche antes o `assistente_dev.py whatsapp`**, se estiver
   aberto: os dois juntos disputam a mesma conexão.
   - **Conectar WhatsApp**: como a conexão do teste A ficou salva, deve ir direto para "Conectado
     ao número ..." (se pedir QR, escaneie o QR da tela);
   - na "Mensagem para mim", mande um código + áudio e reaja com 🤖: a resposta chega como no teste A;
   - **Desligar** e conectar de novo. Só use **Desconectar este computador** no fim: ele tira o
     aparelho do celular e aí precisa de QR de novo.
9. **Propostas:** com o WhatsApp conectado, na "Mensagem para mim" mande
   `/ensinar 4031195 igual 3790509 teste`. Em **Para revisar** aparece a proposta no topo:
   **Aprovar** vira regra (aparece em Conhecimento, e "tem a 4031195?" passa a citar a 3790509
   como igual); mande outra e **Recuse**.

---

## C. Qualidade das respostas com o Groq (opcional, ~2 min)

```powershell
C:\dev\chronos-venv\Scripts\python.exe scripts\assistente_avaliacao.py
```

Último resultado: 17 de 17 (15 pela busca direta, 2 pela IA).

---

## D. Conhecimento nas outras máquinas (na empresa, com duas máquinas)

Precisa do Chronos com o assistente nas duas máquinas, na mesma rede.

1. **Máquina do admin:** Backup > Base oficial > "Papel desta máquina" = **Publica a base** e
   **ligue o servidor local** (anote um dos endereços que aparecem, ex.: `http://192.168.0.10:8765`).
   Quem já usa a pasta compartilhada da base oficial pode usar a pasta no lugar do servidor.
2. **Máquina do colega:** "Papel desta máquina" = **Consome a base** e, em "Servidor remoto", o
   endereço anotado (ou a mesma pasta compartilhada).
3. Na máquina do admin, ensine uma regra (Assistente > Admin).
4. Na máquina do colega, feche e abra o Chronos (ou espere até 10 min) e pergunte pelo código no
   chat: a resposta já usa a regra. Em Assistente > Admin > Conhecimento (só leitura) ela aparece.

Na aba Conhecimento das duas máquinas, a linha de status mostra de onde e quando o conhecimento
foi publicado/recebido, com o botão **Sincronizar agora**. Se algo faltar, o aviso diz o que
configurar em Backup > Base oficial.

---

## Ainda não dá para testar (em casa)

- **Conhecimento nas máquinas dos colegas**: pronto (backend e telas), mas só dá para testar na
  empresa, com duas máquinas (passo D).
- **Banco real**: precisa de uma cópia do `estoque.db` da empresa (nunca o original).
- **Instalador**: para gerar o `.msi` com o assistente, o backend precisa ser empacotado de
  novo (`npm run build:app`), com `anthropic` e `neonize` instalados no venv do build.
