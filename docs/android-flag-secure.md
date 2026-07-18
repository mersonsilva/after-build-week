# Proteção contra captura de tela no Android

O AFTER já sinaliza telas sensíveis pelo evento `after:secure-screen` e pelo atributo
`document.documentElement.dataset.secureScreen`.

Telas que ativam proteção:

- Chat
- Visualização de mídia/fotos
- Visualização única
- Edição de perfil, onde aparecem dados sensíveis e saúde/privacidade

Telas que não ativam proteção:

- Descobrir
- Interesses
- Perfil público básico
- Configurações gerais

## Android nativo

O bloqueio real de print/gravação no Android precisa usar `FLAG_SECURE` dentro do app nativo.
Navegador/PWA puro não consegue impedir captura de tela sozinho.

### WebView ou wrapper com bridge JavaScript

Exponha uma bridge chamada `AfterAndroid` para o JavaScript:

```kotlin
class SecureScreenBridge(private val activity: Activity) {
    @JavascriptInterface
    fun setSecureScreen(enabled: Boolean) {
        activity.runOnUiThread {
            if (enabled) {
                activity.window.setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE
                )
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }
    }
}
```

Registre a bridge no `WebView`:

```kotlin
webView.settings.javaScriptEnabled = true
webView.addJavascriptInterface(SecureScreenBridge(this), "AfterAndroid")
```

### Capacitor

Use um plugin de privacidade de tela e mantenha os métodos `enable()` e `disable()`.
O app já tenta chamar:

```js
window.Capacitor.Plugins.PrivacyScreen.enable()
window.Capacitor.Plugins.PrivacyScreen.disable()
```

### Cordova

Use um plugin `SecureScreen` com ações:

```text
enable
disable
```

O app já tenta chamar:

```js
cordova.exec(null, null, "SecureScreen", "enable", [])
cordova.exec(null, null, "SecureScreen", "disable", [])
```

### TWA/PWABuilder

Se o pacote for uma TWA pura sem código-fonte, não há bridge JavaScript disponível por padrão.
Nesse caso existem duas opções:

1. Baixar o pacote com código-fonte no PWABuilder e adicionar uma ponte nativa.
2. Aplicar `FLAG_SECURE` globalmente na Activity da TWA, protegendo o app inteiro.

Para proteção seletiva por tela, use WebView/Capacitor ou implemente comunicação nativa com a TWA.

## Teste

1. Abrir Descobrir: print deve funcionar.
2. Abrir Interesses: print deve funcionar.
3. Abrir Chat: Android deve bloquear print/gravação.
4. Abrir foto ampliada/visualização única: Android deve bloquear print/gravação.
5. Abrir edição de perfil: Android deve bloquear print/gravação.
6. Voltar para Descobrir: print deve voltar a funcionar.
