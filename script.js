/* =========================================================
   Vipme - página de evento (recriação)
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     CONFIGURAÇÃO DO ENVIO PARA A PLANILHA
     Preencha as duas constantes com os dados da implantação do
     Apps Script (ver apps-script/enviar-convidados.gs).
     Com ENDPOINT vazio, o formulário só valida localmente.
     --------------------------------------------------------- */
  // Cole aqui a URL /exec da implantação (passo 3 do arquivo .gs):
  var ENDPOINT = '';

  // Já corresponde ao SHARED_TOKEN do Apps Script. Se mudar um, mude o outro.
  var TOKEN = 'tWca434ZhB7KGnf6DnsWsqBbuxnW';

  /* ---------------------------------------------------------
     1. Botões de compartilhamento
     --------------------------------------------------------- */
  var tituloEl = document.querySelector('.hero__title');
  var nomeEvento = tituloEl ? tituloEl.textContent.trim() : document.title;
  var shareUrl = window.location.href;

  var builders = {
    whatsapp: function (url, text) {
      return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text + ' - ' + url);
    },
    twitter: function (url, text) {
      return 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url) +
             '&text=' + encodeURIComponent(text);
    },
    facebook: function (url) {
      return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    }
  };

  Array.prototype.forEach.call(
    document.querySelectorAll('[data-share]'),
    function (link) {
      var build = builders[link.getAttribute('data-share')];
      if (!build) { return; }

      link.setAttribute('href', build(shareUrl, nomeEvento));

      link.addEventListener('click', function (event) {
        var popup = window.open(
          link.href,
          'vipme-share',
          'width=600,height=520,noopener,noreferrer'
        );
        if (popup) { event.preventDefault(); }
      });
    }
  );

  /* ---------------------------------------------------------
     2. Formulário de convidados
     --------------------------------------------------------- */
  var form = document.getElementById('guestForm');
  if (!form) { return; }

  var field = document.getElementById('guests');
  var feedback = document.getElementById('formFeedback');
  var button = form.querySelector('.btn');
  var honeypot = form.querySelector('[name="_hp"]');
  var textoBotao = button.textContent;
  var enviando = false;

  function setFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = 'form__feedback' + (type ? ' form__feedback--' + type : '');
    feedback.hidden = !message;
  }

  function travarBotao(travado, texto) {
    enviando = travado;
    button.disabled = travado;
    button.textContent = travado ? (texto || 'Enviando...') : textoBotao;
  }

  /** Uma linha = um nome. Linhas vazias são ignoradas. */
  function parseGuests(value) {
    return value
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; });
  }

  /** "1 convidado enviado" / "3 convidados enviados" */
  function frase(n, participio) {
    return n === 1
      ? '1 convidado ' + participio
      : n + ' convidados ' + participio + 's';
  }

  /**
   * Envia para o Apps Script.
   * Content-Type text/plain é intencional: mantém a requisição "simples" e
   * evita o preflight CORS, que o Apps Script não sabe responder.
   */
  function enviarParaPlanilha(convidados) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        token: TOKEN,
        evento: nomeEvento,
        convidados: convidados,
        enviadoEm: new Date().toISOString()
      })
    })
    .then(function (resposta) {
      if (!resposta.ok) { throw new Error('http_' + resposta.status); }
      return resposta.json();
    })
    .then(function (dados) {
      if (!dados || dados.ok !== true) {
        throw new Error((dados && dados.erro) || 'resposta_invalida');
      }
      return dados;
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (enviando) { return; }

    // Campo isca: humano não preenche, bot preenche. Finge sucesso e ignora.
    if (honeypot && honeypot.value !== '') {
      setFeedback('Enviado com sucesso.', 'success');
      return;
    }

    var guests = parseGuests(field.value);

    if (guests.length === 0) {
      field.classList.remove('is-valid');
      setFeedback('Preencha pelo menos um nome para continuar.', 'error');
      field.focus();
      return;
    }

    field.classList.add('is-valid');
    field.value = guests.join('\n'); // normaliza linhas em branco

    // Sem endpoint configurado: valida e confirma localmente.
    if (!ENDPOINT) {
      setFeedback(frase(guests.length, 'validado') + '. Configure ENDPOINT no script.js para gravar na planilha.', 'success');
      return;
    }

    travarBotao(true);
    setFeedback('Enviando...', '');

    enviarParaPlanilha(guests)
      .then(function (dados) {
        setFeedback(frase(dados.gravados || guests.length, 'enviado') + ' com sucesso.', 'success');
        field.value = '';
      })
      .catch(function (erro) {
        // Atenção: falha de rede/CORS não garante que a linha não foi gravada.
        // Os nomes ficam no campo de propósito, para não perder o que foi digitado.
        console.error('Falha ao enviar convidados:', erro);
        setFeedback('Não foi possível enviar agora. Confira sua conexão e tente novamente.', 'error');
      })
      .then(function () {
        travarBotao(false);
      });
  });

  // Limpa a mensagem de erro assim que o usuário começa a corrigir.
  field.addEventListener('input', function () {
    if (feedback.classList.contains('form__feedback--error')) {
      setFeedback('');
    }
  });
})();
