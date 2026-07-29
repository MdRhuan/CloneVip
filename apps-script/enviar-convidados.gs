/**
 * =========================================================================
 * Recebe os nomes do formulário e grava numa planilha Google
 * (uma linha por convidado).
 *
 * COMO INSTALAR — siga na ordem
 * -----------------------------
 * 1. Crie a planilha no Google. Copie o ID da URL:
 *      docs.google.com/spreadsheets/d/[ESTE_PEDACO_E_O_ID]/edit
 *    Cole em SHEET_ID abaixo.
 *
 * 2. Em script.google.com > Novo projeto, apague o conteúdo padrão e cole
 *    este arquivo inteiro. Salve.
 *
 * 3. Implantar > Nova implantação > engrenagem > "App da Web":
 *      - Executar como:      Eu
 *      - Quem pode acessar:  Qualquer pessoa
 *    Na primeira vez o Google pede autorização. O aviso de "app não
 *    verificado" é esperado: é o seu próprio script. Avançado > Acessar.
 *    Copie a URL que termina em /exec.
 *
 * 4. TESTE antes de mexer no site. Abra no navegador:
 *      <SUA_URL_/exec>?token=tWca434ZhB7KGnf6DnsWsqBbuxnW
 *    Deve responder "ok":true com o nome da aba. Se der erro, o problema
 *    está aqui — resolva antes de seguir.
 *
 * 5. No script.js do site, preencha ENDPOINT com a URL /exec.
 *    O TOKEN já está preenchido nos dois arquivos.
 *
 * ATENÇÃO: toda vez que alterar este código, é preciso criar uma NOVA VERSÃO
 * da implantação (Implantar > Gerenciar implantações > lápis > Versão: nova).
 * Só salvar o arquivo NÃO atualiza a URL /exec que já está publicada.
 * =========================================================================
 */

/* ----------------------- CONFIGURAÇÃO ----------------------- */

var SHEET_ID   = 'COLE_O_ID_DA_PLANILHA_AQUI';
var SHEET_NAME = 'Convidados';

/**
 * Token compartilhado com o front-end.
 * Isto NÃO é autenticação: quem abrir o código-fonte da página consegue lê-lo.
 * Serve para descartar tráfego automatizado que ache a URL por acidente.
 * Para realmente barrar envios indevidos, use um captcha (Turnstile /
 * reCAPTCHA) e valide o token dele aqui dentro.
 */
var SHARED_TOKEN = 'tWca434ZhB7KGnf6DnsWsqBbuxnW';

var MAX_CONVIDADOS = 300;  // por envio
var MAX_TAM_NOME   = 120;  // caracteres
var CABECALHO      = ['Data/hora', 'Evento', 'Convidado', 'ID do envio'];

/* ----------------------- ENDPOINTS ----------------------- */

/**
 * Diagnóstico de instalação (passo 4).
 * Exige o token para não expor dados da planilha a quem tiver só a URL.
 */
function doGet(e) {
  var token = e && e.parameter ? e.parameter.token : '';

  if (SHARED_TOKEN && token !== SHARED_TOKEN) {
    return responder({ ok: false, erro: 'token_invalido', dica: 'chame ?token=SEU_TOKEN' });
  }
  if (!estaConfigurado()) {
    return responder({ ok: false, erro: 'sheet_id_nao_configurado' });
  }

  try {
    var aba = obterAba();
    return responder({
      ok: true,
      planilha: SpreadsheetApp.openById(SHEET_ID).getName(),
      aba: aba.getName(),
      convidados_gravados: Math.max(0, aba.getLastRow() - 1)
    });
  } catch (err) {
    console.error(err);
    return responder({ ok: false, erro: 'nao_consegui_abrir_a_planilha', detalhe: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    if (!estaConfigurado()) {
      return responder({ ok: false, erro: 'sheet_id_nao_configurado' });
    }
    if (!e || !e.postData || !e.postData.contents) {
      return responder({ ok: false, erro: 'corpo_vazio' });
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (erroJson) {
      return responder({ ok: false, erro: 'json_invalido' });
    }

    if (SHARED_TOKEN && body.token !== SHARED_TOKEN) {
      return responder({ ok: false, erro: 'token_invalido' });
    }

    // Nunca confie na validação do cliente: revalide tudo aqui.
    var convidados = (body.convidados || [])
      .map(function (nome) { return String(nome == null ? '' : nome).trim(); })
      .filter(function (nome) { return nome.length > 0; })
      .slice(0, MAX_CONVIDADOS)
      .map(function (nome) { return nome.slice(0, MAX_TAM_NOME); });

    if (convidados.length === 0) {
      return responder({ ok: false, erro: 'nenhum_nome' });
    }

    var evento  = String(body.evento || '').slice(0, 200);
    var idEnvio = Utilities.getUuid().slice(0, 8);
    var agora   = new Date();

    var linhas = convidados.map(function (nome) {
      return [agora, protegerCelula(evento), protegerCelula(nome), idEnvio];
    });

    // Sem lock, dois envios simultâneos podem gravar sobre a mesma linha.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) {
      return responder({ ok: false, erro: 'ocupado' });
    }

    try {
      var aba = obterAba();
      aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CABECALHO.length)
         .setValues(linhas);
    } finally {
      lock.releaseLock();
    }

    return responder({ ok: true, gravados: convidados.length, envio: idEnvio });

  } catch (err) {
    // Não devolva a mensagem crua ao cliente; registre no log de execuções.
    console.error(err);
    return responder({ ok: false, erro: 'falha_interna' });
  }
}

/* ----------------------- AUXILIARES ----------------------- */

function estaConfigurado() {
  return SHEET_ID && SHEET_ID.indexOf('COLE_O_ID') !== 0;
}

function obterAba() {
  var planilha = SpreadsheetApp.openById(SHEET_ID);
  var aba = planilha.getSheetByName(SHEET_NAME);

  if (!aba) {
    aba = planilha.insertSheet(SHEET_NAME);
  }
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHO);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

/**
 * Um nome começando com = + - @ é interpretado como fórmula pelo Sheets
 * (injeção de fórmula). O apóstrofo força o conteúdo a ser texto.
 */
function protegerCelula(valor) {
  return /^[=+\-@\t\r]/.test(valor) ? "'" + valor : valor;
}

/**
 * ContentService não permite definir cabeçalhos de resposta, ou seja: não há
 * como adicionar Access-Control-Allow-Origin. É por isso que o front-end envia
 * Content-Type: text/plain — assim o navegador não dispara preflight CORS.
 */
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
