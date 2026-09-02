const express = require('express');
const router = express.Router();
const { definirCookieSessao, limparCookieSessao, estaAutenticado } = require('../services/auth');
const usuarios = require('../services/usuarios');

// Só aceita caminho interno, para o parâmetro de retorno não virar
// redirecionamento para site externo.
function destinoSeguro(valor) {
  const bruto = String(valor || '/');
  return /^\/(?!\/)/.test(bruto) ? bruto : '/';
}

router.get('/login', (req, res) => {
  if (estaAutenticado(req)) return res.redirect('/');

  res.render('login', {
    erro: req.query.erro ? 'Login ou senha incorretos.' : null,
    destino: destinoSeguro(req.query.destino),
    login: req.query.login || ''
  });
});

router.post('/login', (req, res) => {
  const destino = destinoSeguro(req.body.destino);
  const usuario = usuarios.autenticar(req.body.login, req.body.senha);

  if (!usuario) {
    // Devolve o login digitado para não obrigar a redigitar no celular,
    // mas nunca diz qual das duas partes estava errada.
    const qs = new URLSearchParams({ erro: '1', destino, login: String(req.body.login || '') });
    return res.redirect(`/login?${qs}`);
  }

  definirCookieSessao(res, usuario);

  // Corretor não tem o que fazer no painel: ele abre no espelho, que é
  // o motivo pelo qual entrou.
  if (destino === '/' && usuario.papel === 'corretor') return res.redirect('/espelho');
  res.redirect(destino);
});

router.post('/logout', (req, res) => {
  limparCookieSessao(res);
  res.redirect('/login');
});

module.exports = router;
