const express = require('express');
const router = express.Router();
const usuarios = require('../services/usuarios');
const { exigirAdmin } = require('../services/auth');

router.use(exigirAdmin);

function voltar(res, chave, valor) {
  const qs = valor ? `?${chave}=${encodeURIComponent(valor)}` : '';
  res.redirect(`/usuarios${qs}`);
}

router.get('/', (req, res) => {
  res.render('usuarios', {
    lista: usuarios.listar(),
    erro: req.query.erro || null,
    aviso: req.query.aviso || null,
    // Senha recém-criada aparece uma única vez: não guardamos texto puro,
    // então é aqui ou nunca.
    senhaNova: req.query.senha || null,
    loginNovo: req.query.login || null
  });
});

router.post('/', (req, res) => {
  try {
    usuarios.criar({
      nome: req.body.nome,
      login: req.body.login,
      senha: req.body.senha,
      papel: req.body.papel
    });
    const qs = new URLSearchParams({
      senha: req.body.senha,
      login: String(req.body.login || '').trim().toLowerCase()
    });
    res.redirect(`/usuarios?${qs}`);
  } catch (e) {
    voltar(res, 'erro', e.message);
  }
});

router.post('/:id/senha', (req, res) => {
  try {
    usuarios.trocarSenha(req.params.id, req.body.senha);
    const qs = new URLSearchParams({
      senha: req.body.senha,
      login: (usuarios.porId(req.params.id) || {}).login || ''
    });
    res.redirect(`/usuarios?${qs}`);
  } catch (e) {
    voltar(res, 'erro', e.message);
  }
});

router.post('/:id/ativo', (req, res) => {
  try {
    const ativar = req.body.ativo === '1';
    usuarios.definirAtivo(req.params.id, ativar);
    voltar(res, 'aviso', ativar ? 'Usuário reativado.' : 'Usuário desativado. Ele não entra mais.');
  } catch (e) {
    voltar(res, 'erro', e.message);
  }
});

module.exports = router;
