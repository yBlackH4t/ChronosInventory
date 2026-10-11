# Chronos Casa — prova de conceito (Android)

App mínimo para provar o caminho do modo Casa (`docs/PLANO_SEGMENTOS.md`, seção 6): o celular bipa
um código de barras e pergunta ao Chronos do computador, pela rede de casa, qual produto é.

- Usa a rota do scanner que já existe: `POST /api/scanner/barcode` (a única liberada na rede).
- O pedido sai pelo plugin `http` do Tauri (Rust), sem esbarrar em CORS nem no bloqueio de HTTP
  do Android. A permissão só deixa falar com `http://*:8000/api/scanner/*`.
- A câmera usa o plugin oficial `barcode-scanner`. Um leitor Bluetooth também funciona: ele
  "digita" o código no campo de texto.
- Não muda nada no app de turbinas.

## 1. Preparar o PC (uma vez só)

1. Instale o **Android Studio** (developer.android.com/studio). Na primeira abertura, deixe
   instalar o SDK padrão.
2. No Android Studio: **More Actions > SDK Manager > SDK Tools**, marque **NDK (Side by side)**,
   **Android SDK Command-line Tools** e **Android SDK Platform-Tools**, e clique em OK.
3. Variáveis de ambiente (PowerShell; depois **feche e abra o terminal**):
   ```powershell
   [Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   $ndk = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\ndk" | Sort-Object Name | Select-Object -Last 1
   [Environment]::SetEnvironmentVariable("NDK_HOME", $ndk.FullName, "User")
   ```
4. Alvos Android do Rust:
   ```powershell
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

5. **Modo de Desenvolvedor do Windows**: Configurações > Sistema > Para desenvolvedores > ligar.
   Sem ele o build para em "Creation symbolic link is not allowed for this system".

## 2. Preparar o celular

1. Configurações > Sobre o telefone > toque 7 vezes em **Número da versão** (libera o modo
   desenvolvedor).
2. Configurações > Opções do desenvolvedor > ligue **Depuração USB**.
3. Ligue o celular no PC pelo cabo e aceite "Permitir depuração USB".

## 3. Rodar no celular

```powershell
cd C:\Users\rafae\Documents\ChronosInventory\mobile
npm install
# o projeto Android (src-tauri\gen\android) já está no git; "npx tauri android init" só se apagar
npx tauri android build --apk --debug --target armv7
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk
```

- **Processador do celular:** `adb shell getprop ro.product.cpu.abi`. `armeabi-v7a` (32 bits, como
  o Galaxy A10s do teste) → `--target armv7`; `arm64-v8a` → `--target aarch64`.
- Sem cabo de dados: copie o `.apk` para o celular e instale (permitir "fontes desconhecidas").
- `npx tauri android dev` também funciona, mas o celular precisa alcançar o Vite do PC.

## 4. Testar

1. Abra o **Chronos no computador** (ele precisa estar aberto).
2. Descubra o endereço: no Chronos, abra o scanner de celular (o QR mostra algo como
   `http://192.168.0.10:8000`). O celular precisa estar **no mesmo Wi-Fi**.
3. **Firewall:** a rede de casa deve estar como **Privada** (Configurações > Rede e Internet), e a
   porta 8000 liberada nela. No PowerShell **como administrador**:
   ```powershell
   New-NetFirewallRule -DisplayName "Chronos - celular na rede de casa (porta 8000)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Profile Private -Action Allow
   ```
   Cuidado: liberar o Python quando a rede está "Pública" e depois trocar para "Privada" deixa a
   regra sem efeito (aconteceu no teste).
4. No app: digite o endereço, toque em **Bipar com a câmera** e aponte para um código de barras.
   Também dá para digitar um código, ou o ID `CI-123` de uma etiqueta do Chronos.

**Deu certo se:** a câmera abre, lê o código, e o app mostra o nome do produto (ou "ainda não
cadastrado"), e no computador o código aparece como se tivesse vindo do scanner.

O plugin da câmera **não pede a permissão sozinho**: o app chama `checkPermissions` /
`requestPermissions` antes do `scan` (sem isso o Android deixa a câmera negada).

## Resultado (2026-10-11)

Aprovado num **Galaxy A10s** (Android 11, 32 bits), PC no cabo de rede e celular no Wi-Fi do mesmo
roteador: `CI-187` digitado trouxe "CONJUNTO CENTRAL B1G 11559880005", e a câmera leu o EAN de
uma maionese, que voltou como "não cadastrado". Câmera, rede de casa e PC respondendo funcionam.

## Versões

Fixas e lançadas há mais de duas semanas: Tauri 2.12.0 (`tauri-build` 2.7.0, `@tauri-apps/api` e
`cli` 2.12.0), `plugin-http` 2.7.0 e `plugin-barcode-scanner` 2.5.0. O Tauri exige o mesmo
major.minor no `package.json` e no `Cargo.toml`.
