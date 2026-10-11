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

## 2. Preparar o celular

1. Configurações > Sobre o telefone > toque 7 vezes em **Número da versão** (libera o modo
   desenvolvedor).
2. Configurações > Opções do desenvolvedor > ligue **Depuração USB**.
3. Ligue o celular no PC pelo cabo e aceite "Permitir depuração USB".

## 3. Rodar no celular

```powershell
cd C:\Users\rafae\Documents\ChronosInventory\mobile
npm install
npx tauri android init      # só na primeira vez: cria src-tauri\gen\android
npx tauri android dev       # instala e abre o app no celular ligado no cabo
```

Para gerar um `.apk` e instalar sem cabo: `npx tauri android build --apk` (o arquivo sai em
`src-tauri\gen\android\app\build\outputs\apk\`).

## 4. Testar

1. Abra o **Chronos no computador** (ele precisa estar aberto).
2. Descubra o endereço: no Chronos, abra o scanner de celular (o QR mostra algo como
   `http://192.168.0.10:8000`). O celular precisa estar **no mesmo Wi-Fi**.
3. Se o Windows perguntar sobre o firewall para o Chronos/Python, permita em **redes privadas**.
4. No app: digite o endereço, toque em **Bipar com a câmera** e aponte para um código de barras.
   Também dá para digitar um código, ou o ID `CI-123` de uma etiqueta do Chronos.

**Deu certo se:** a câmera abre, lê o código, e o app mostra o nome do produto (ou "ainda não
cadastrado"), e no computador o código aparece como se tivesse vindo do scanner.

## Versões

Fixas e lançadas há mais de duas semanas: Tauri 2.12.0 (`tauri-build` 2.7.0, `@tauri-apps/api` e
`cli` 2.12.0), `plugin-http` 2.7.0 e `plugin-barcode-scanner` 2.5.0. O Tauri exige o mesmo
major.minor no `package.json` e no `Cargo.toml`.
