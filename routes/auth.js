const express = require('express');
const router = express.Router();
const { senhaConfere, definirCookieSessao, limparCookieSessao, estaAutenticado } = require('../services/auth');

// Só aceita caminho interno, para o parâmetro de retorno não virar
// redirecionamento para site externo.
function destinoSeguro(valor) {
  const bruto = String(valor || '/');
  return /^\/(?!\/)/.test(bruto) ? bruto : '/';
}

router.get('/login', (req, res) => {
  if (estaAutenticado(req)) return res.redirect('/');

  res.render('login', {
    erro: req.query.erro ? 'Senha incorreta. Tente novamente.' : null,
    destino: destinoSeguro(req.query.destino)
  });
});

router.post('/login', (req, res) => {
  const destino = destinoSeguro(req.body.destino);

  if (!senhaConfere(req.body.senha)) {
    return res.redirect(`/login?erro=1&destino=${encodeURIComponent(destino)}`);
  }

  definirCookieSessao(res);
  res.redirect(destino);
});

router.post('/logout', (req, res) => {
  limparCookieSessao(res);
  res.redirect('/login');
});

module.exports = router;
