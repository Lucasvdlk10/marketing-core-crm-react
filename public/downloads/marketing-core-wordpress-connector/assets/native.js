(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.mcwp-form[data-endpoint]').forEach(function (form) {
      var params = new URLSearchParams(window.location.search);
      ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (key) {
        var field = form.querySelector('[name="utm_' + key + '"]');
        if (field) field.value = (params.get('utm_' + key) || '').substring(0, 150);
      });
    });
  });
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('.mcwp-form[data-endpoint]');
    if (!form) return;
    event.preventDefault();
    var status = form.querySelector('.mcwp-feedback');
    var button = form.querySelector('[type="submit"]');
    var data = {};
    new FormData(form).forEach(function (value, key) {if (typeof value === 'string') data[key] = value;});
    button.disabled = true;
    status.textContent = 'Enviando…';
    fetch(form.dataset.endpoint, {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)})
      .then(function (response) {if (!response.ok) throw new Error('submission_failed'); return response.json();})
      .then(function (body) {if (!body.ok) throw new Error('submission_failed'); status.textContent='Formulário recebido. Obrigado!';form.reset();})
      .catch(function () {status.textContent='Não foi possível receber o formulário. Confira os dados e tente novamente.';})
      .finally(function () {button.disabled=false;});
  });
}());
