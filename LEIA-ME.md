# Página de evento — Vipme (recriação)

Página estática (HTML/CSS/JS puro, sem build e sem dependência externa) com
formulário de convidados que grava numa planilha do Google.

```
index.html                        estrutura + ícones SVG inline
style.css                         estilos e responsividade
script.js                         compartilhamento, validação e envio
apps-script/enviar-convidados.gs  código que roda no Google e grava na planilha
apps-script/teste-local.js        testes da lógica do .gs (node apps-script/teste-local.js)
```

Abrir `index.html` no navegador já funciona. Sem o `ENDPOINT` configurado, o
formulário valida e confirma localmente, sem enviar nada.

---

## Ligar o formulário na planilha

### 1. Criar a planilha

Crie uma planilha no Google e copie o ID da URL:

```
docs.google.com/spreadsheets/d/[ESTE_PEDACO_E_O_ID]/edit
```

Não precisa criar colunas nem aba: o script cria a aba `Convidados` e o
cabeçalho no primeiro envio.

### 2. Colar o script

Em [script.google.com](https://script.google.com) → **Novo projeto**. Apague o
conteúdo padrão, cole `apps-script/enviar-convidados.gs` inteiro e preencha:

```js
var SHEET_ID = 'o_id_que_você_copiou';
```

O `SHARED_TOKEN` já vem preenchido e já corresponde ao `TOKEN` do `script.js`.
Salve.

### 3. Implantar

**Implantar → Nova implantação → engrenagem → App da Web:**

| Campo | Valor |
|---|---|
| Executar como | Eu |
| Quem pode acessar | Qualquer pessoa |

Na primeira vez o Google pede autorização. O aviso de *"app não verificado"* é
esperado — é o seu próprio script. **Avançado → Acessar (não seguro)**.

Copie a URL que termina em `/exec`.

### 4. Testar antes de mexer no site

Abra no navegador:

```
<SUA_URL_/exec>?token=tWca434ZhB7KGnf6DnsWsqBbuxnW
```

Resposta esperada:

```json
{"ok":true,"planilha":"...","aba":"Convidados","convidados_gravados":0}
```

Se não vier isso, o problema está na implantação. Resolva aqui antes de seguir —
depurar pelo site é bem pior.

### 5. Apontar o site para o endpoint

Em `script.js`, linha ~16:

```js
var ENDPOINT = 'https://script.google.com/macros/s/AKfy.../exec';
```

Pronto. Cada envio grava **uma linha por convidado**:

| Data/hora | Evento | Convidado | ID do envio |
|---|---|---|---|
| 29/07/2026 15:30 | Saideira | Ana | 3f9a1c22 |
| 29/07/2026 15:30 | Saideira | Bruno | 3f9a1c22 |

O `ID do envio` agrupa os nomes que chegaram juntos — é o que permite
identificar envio duplicado na planilha.

---

## Se alterar o .gs depois

Salvar o arquivo **não** atualiza a URL `/exec` já publicada. É preciso criar
uma nova versão:

**Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar.**

Esse é o erro mais comum: alterar o código, testar, e continuar vendo o
comportamento antigo.

---

## Diagnóstico

| Resposta | Causa provável |
|---|---|
| `token_invalido` | `TOKEN` do `script.js` ≠ `SHARED_TOKEN` do `.gs` |
| `sheet_id_nao_configurado` | `SHEET_ID` ainda com o valor de exemplo |
| `nao_consegui_abrir_a_planilha` | ID errado, ou a conta que implantou não tem acesso |
| Página do Google pedindo login | implantado como "Somente eu" em vez de "Qualquer pessoa" |
| Erro de CORS no console | ver a observação abaixo |
| `ocupado` | dois envios simultâneos; o segundo deve tentar de novo |

Detalhe dos erros internos: no editor do Apps Script, **Execuções**.

---

## O que este código NÃO resolve

Sendo direto, para você decidir com informação:

**O endpoint é público.** Qualquer chave dentro do JavaScript é visível a quem
abrir o código-fonte da página. O `SHARED_TOKEN` descarta tráfego automatizado
que ache a URL por acidente; não impede quem quiser mandar lixo de propósito.
Existe um campo isca (honeypot) contra bots simples. Para barragem real, o
caminho é Turnstile ou reCAPTCHA validado dentro do `doPost`.

**Erro na tela não prova que não gravou.** Se a rede cair depois de o Google já
ter escrito a linha, o usuário vê erro e reenvia → linha duplicada. O `ID do
envio` serve para achar esses casos. Resolver de verdade exige idempotência com
ID gerado no cliente.

**O `Content-Type: text/plain` é intencional.** O `ContentService` do Apps
Script não permite definir cabeçalhos de resposta, logo não há como enviar
`Access-Control-Allow-Origin`. Mandar como texto simples evita o preflight
CORS. **Isso precisa ser validado no seu domínio real** — o comportamento de
CORS do Apps Script já mudou ao longo do tempo. Se travar, o plano B é POST via
iframe oculto (fire-and-forget, sem ler a resposta).

**Nome de convidado é dado pessoal.** Quem preenche informa nomes de terceiros
que nunca visitaram a página. Isso entra no escopo da LGPD, e o link
"Política de Privacidade" no rodapé ainda aponta para `#`. Não é opinião
jurídica — é um ponto para levar a quem entende do assunto antes de publicar.

**Cota do Apps Script.** Existem limites diários de execução em contas Google.
Não cito números porque não tenho os valores atuais verificados — se você espera
volume alto, confirme na documentação do Google antes.

---

## Alternativas

- **Backend próprio + Sheets API** — resolve o endpoint público e o CORS de uma
  vez. É o caminho mais sólido se você já tem servidor.
- **SheetDB, Sheety, Formspree** — menos código, mas adicionam um terceiro no
  meio e têm limites de plano que você precisa conferir na fonte.
