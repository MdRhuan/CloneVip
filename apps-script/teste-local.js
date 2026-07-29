/**
 * Testa a lógica de enviar-convidados.gs fora do Google, com stubs das APIs
 * (SpreadsheetApp, LockService, Utilities, ContentService).
 *
 * Rodar:  node apps-script/teste-local.js
 *
 * Serve para validar validação, limites e proteção contra injeção de fórmula
 * sem precisar reimplantar o App da Web. NÃO testa autenticação, CORS nem
 * permissões do Google — isso só se verifica na implantação real.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQUIVO = path.join(__dirname, 'enviar-convidados.gs');
let code = fs.readFileSync(ARQUIVO, 'utf8');

/* ---------------------- stubs das APIs do Google ---------------------- */
const linhasGravadas = [];
let lockPego = 0, lockSolto = 0;

const abaFake = {
  _lastRow: 0, // planilha nova e vazia: exercita a criação do cabeçalho
  getName: () => 'Convidados',
  getLastRow() { return this._lastRow; },
  appendRow(r) { linhasGravadas.push(['HEADER', ...r]); this._lastRow = 1; },
  setFrozenRows() {},
  getRange(row, col, nRows, nCols) {
    return {
      setFontWeight: () => {},
      setValues: (vals) => {
        if (vals.length !== nRows) throw new Error('nRows != vals.length');
        vals.forEach(v => {
          if (v.length !== nCols) throw new Error('nCols != v.length');
          linhasGravadas.push([row++, ...v]);
        });
        abaFake._lastRow += vals.length;
      }
    };
  }
};

const sandbox = {
  console,
  SpreadsheetApp: {
    openById: (id) => {
      if (!id || id.startsWith('COLE_O_ID')) throw new Error('ID inválido');
      return {
        getName: () => 'Planilha de Teste',
        getSheetByName: () => abaFake,
        insertSheet: () => abaFake
      };
    }
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => { lockPego++; return true; },
      releaseLock: () => { lockSolto++; }
    })
  },
  Utilities: { getUuid: () => 'aaaabbbb-cccc-dddd-eeee-ffff00001111' },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (txt) => ({ _txt: txt, setMimeType() { return this; } })
  }
};

const EXPOR = '\n;__api = { doGet, doPost, protegerCelula, estaConfigurado };';
const ctx = vm.createContext(sandbox);
vm.runInContext(code + EXPOR, ctx, { filename: 'enviar-convidados.gs' });

// Lê o token direto do arquivo, para o teste não sair de sincronia com o código.
const TOKEN = (code.match(/var SHARED_TOKEN\s*=\s*'([^']*)'/) || [])[1];
if (!TOKEN) { throw new Error('não encontrei SHARED_TOKEN no .gs'); }

const resp = (r) => JSON.parse(r._txt);
const chamar = (api, body) => resp(api.doPost({
  postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) }
}));

let falhas = 0;
function checa(nome, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log((ok ? '  PASSA  ' : '  FALHA  ') + nome + (ok ? '' :
    '\n            esperado: ' + JSON.stringify(esperado) +
    '\n            recebido: ' + JSON.stringify(real)));
}

/* ---------------------- casos ---------------------- */
const api = sandbox.__api;
const post = (b) => chamar(api, b);

console.log('\n--- SEM SHEET_ID configurado ---');
checa('doPost avisa que falta configurar', post({ token: TOKEN, convidados: ['Ana'] }), { ok: false, erro: 'sheet_id_nao_configurado' });
checa('doGet avisa que falta configurar', resp(api.doGet({ parameter: { token: TOKEN } })), { ok: false, erro: 'sheet_id_nao_configurado' });
checa('doGet sem token nao vaza nada', resp(api.doGet({ parameter: {} })), { ok: false, erro: 'token_invalido', dica: 'chame ?token=SEU_TOKEN' });

// recarrega o script com um SHEET_ID válido
code = code.replace(/var SHEET_ID\s*=\s*'[^']*';/, "var SHEET_ID = '1AbC_id_valido';");
vm.runInContext(code + EXPOR, ctx, { filename: 'gs-configurado' });
const api2 = sandbox.__api;
const post2 = (b) => chamar(api2, b);

console.log('\n--- CONFIGURADO: rejeicoes ---');
checa('token errado',   post2({ token: 'x', convidados: ['Ana'] }),  { ok: false, erro: 'token_invalido' });
checa('sem token',      post2({ convidados: ['Ana'] }),              { ok: false, erro: 'token_invalido' });
checa('json quebrado',  post2('{isso nao e json'),                   { ok: false, erro: 'json_invalido' });
checa('corpo vazio',    resp(api2.doPost({})),                       { ok: false, erro: 'corpo_vazio' });
checa('lista vazia',    post2({ token: TOKEN, convidados: [] }),     { ok: false, erro: 'nenhum_nome' });
checa('so espacos',     post2({ token: TOKEN, convidados: ['  ', '\t'] }), { ok: false, erro: 'nenhum_nome' });
checa('campo ausente',  post2({ token: TOKEN }),                     { ok: false, erro: 'nenhum_nome' });
checa('nulos na lista', post2({ token: TOKEN, convidados: [null, undefined] }), { ok: false, erro: 'nenhum_nome' });

console.log('\n--- CONFIGURADO: gravacao ---');
linhasGravadas.length = 0;
const r1 = post2({ token: TOKEN, evento: 'Saideira', convidados: ['Ana', '  Bruno  ', 'Carla'] });
checa('grava 3 e devolve id', { ok: r1.ok, gravados: r1.gravados, tamId: r1.envio.length }, { ok: true, gravados: 3, tamId: 8 });
checa('cabecalho criado', linhasGravadas[0], ['HEADER', 'Data/hora', 'Evento', 'Convidado', 'ID do envio']);
checa('nomes com trim', linhasGravadas.slice(1).map(l => l[3]), ['Ana', 'Bruno', 'Carla']);
checa('mesmo id de envio nas 3 linhas', new Set(linhasGravadas.slice(1).map(l => l[4])).size, 1);
checa('lock pego e solto', [lockPego, lockSolto], [1, 1]);

console.log('\n--- CONFIGURADO: seguranca e limites ---');
linhasGravadas.length = 0;
post2({ token: TOKEN, evento: 'E', convidados: ['=SOMA(A1:A9)', '+1', '-x', '@ana', 'Ana=Bruno'] });
checa('injecao de formula neutralizada', linhasGravadas.map(l => l[3]),
  ["'=SOMA(A1:A9)", "'+1", "'-x", "'@ana", 'Ana=Bruno']);

linhasGravadas.length = 0;
post2({ token: TOKEN, convidados: ['N'.repeat(200)] });
checa('nome truncado em 120', linhasGravadas[0][3].length, 120);

linhasGravadas.length = 0;
const r2 = post2({ token: TOKEN, convidados: Array.from({ length: 500 }, (_, i) => 'Convidado ' + i) });
checa('limite de 300 por envio', [r2.gravados, linhasGravadas.length], [300, 300]);

console.log('\n--- doGet configurado ---');
const g = resp(api2.doGet({ parameter: { token: TOKEN } }));
checa('doGet reporta planilha e aba', { ok: g.ok, planilha: g.planilha, aba: g.aba },
  { ok: true, planilha: 'Planilha de Teste', aba: 'Convidados' });

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
process.exit(falhas === 0 ? 0 : 1);
