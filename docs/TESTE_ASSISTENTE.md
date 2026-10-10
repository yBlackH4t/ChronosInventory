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
exemplo: 5327-988-7101 similar à 5327-988-7116).

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
4. Mande `/ajuda`, `/pendentes` e `/ensinar 5327-988-7101 similar 5327-988-7116 teste`.
5. Ctrl+C para sair. Só quando terminar **todos** os testes, remova o aparelho conectado no
   celular ("Neonize" nas conexões antigas, "Chronos" nas novas); depois disso precisa de QR de novo.

O que conferir: o áudio foi entendido? A resposta veio certa, no formato do WhatsApp e
**citando a mensagem**? O 🤖 **sumiu**? O registro do teste fica em
`%TEMP%\chronos_assistente\whatsapp_dev.log` (endereços mascarados, sem os textos).

**Primeiro teste (2026-10-09):** resposta, áudio e `/ajuda` ok; a resposta veio **sem citar** a
mensagem e o 🤖 **não saiu**. Corrigido no código (citação com o autor no mesmo tipo de endereço da
conversa; o 🤖 sai com a mesma chave que o WhatsApp mandou); falta confirmar no celular.

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
   Essas respostas vêm marcadas **"Busca direta (sem IA)"**, e isso é o normal: código e
   veículo/motor são respondidos pela busca direta, na hora e sem gastar o limite gratuito
   (o selo vai mudar; pedido ao Antigravity). Para ver a IA, pergunte algo fora do padrão,
   ex.: "qual a capital da frança?" ou "tem turbina pro caminhão do meu tio?".
2. **Configurações > Assistente de IA:** deve mostrar Groq, configurado (a chave já está salva).
   Teste trocar para "Sem IA (só busca direta)" e voltar.
3. **Tornar esta máquina admin:** tela **Backup > Base oficial**, na configuração,
   "Papel desta máquina" = **Publica a base**, e salve. Não precisa publicar nada.
4. **Assistente > Admin:** criar a senha de admin e entrar.
5. **Fluxo de ensinar** (o seu exemplo da 7210):
   - no chat, pergunte "tem a 5327-988-7210?" → "não temos esse código" (e a ficha K27 do catálogo);
   - Admin > **Para revisar**: aparece a 53279887210 com a sugestão *TURBO K27 - 53279887116*;
   - clique **"É similar"** e escreva "muda o atuador";
   - no chat, pergunte "tem a 988-7210?" (só o final) → deve entender como 5327-988-7210 e
     oferecer a K27 como similar.
6. **Conhecimento:** a regra aparece; exclua e veja o chat deixar de oferecer a K27.
7. **Histórico:** as conversas aparecem; corrija uma resposta; exporte o JSONL.

---

## C. Qualidade das respostas com o Groq (opcional, ~2 min)

```powershell
C:\dev\chronos-venv\Scripts\python.exe scripts\assistente_avaliacao.py
```

Último resultado: 17 de 17 (15 pela busca direta, 2 pela IA).

---

## Ainda não dá para testar

- **Aba WhatsApp dentro do app** (QR na tela, ligar/desligar) e **aprovar propostas** do
  `/ensinar`: o backend está pronto, as telas são o próximo pedido do Antigravity.
- **Conhecimento nas máquinas dos colegas**: ainda não é distribuído (Fase 2c).
- **Instalador**: para gerar o `.msi` com o assistente, o backend precisa ser empacotado de
  novo (`npm run build:app`), com `anthropic` e `neonize` instalados no venv do build.
