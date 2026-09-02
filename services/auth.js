const crypto = require('crypto');
const usuarios = require('./usuarios');

const NOME_COOKIE = 'sessao';

function segredo() {
  const valor = process.env.SESSION_SECRET;
  if (!valor) {
    throw new Error('SESSION_SECRET não configurado. Veja o .env.example.');
  }
  return valor;
}

function assinar(dados) {
  return crypto.createHmac('sha256', segredo()).update(dados).digest('base64url');
}

/**
 * O token carrega quem é e até quando vale — nada mais. O papel fica de fora
 * de propósito: ele é lido do banco a cada requisição, então promover, rebaixar
 * ou desativar alguém vale na hora, sem esperar a sessão expirar.
 */
function criarToken(usuarioId, horas) {
  const dados = `${usuarioId}.${Date.now() + horas * 60 * 60 * 1000}`;
  return `${dados}.${assinar(dados)}`;
}

function lerToken(token) {
  if (!token) return null;

  const partes = String(token).split('.');
  if (partes.length !== 3) return null;

  const [id, expiraEm, assinatura] = partes;
  const esperada = assinar(`${id}.${expiraEm}`);

  // Comparação em tempo constante evita vazar informação pelo tempo de resposta
  const a = Buffer.from(assinatura || '');
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  if (Number(expiraEm) <= Date.now()) return null;

  return { usuarioId: Number(id) };
}

function lerCookie(req, nome) {
  const bruto = req.headers.cookie || '';
  const par = bruto.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${nome}=`));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : null;
}

function definirCookieSessao(res, usuario) {
  const horas = usuarios.horasDeSessao(usuario.papel);
  const partes = [
    `${NOME_COOKIE}=${criarToken(usuario.id, horas)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${horas * 60 * 60}`
  ];
  // Em produção o cookie só trafega por HTTPS
  if (process.env.NODE_ENV === 'production') partes.push('Secure');

  res.setHeader('Set-Cookie', partes.join('; '));
}

function limparCookieSessao(res) {
  res.setHeader('Set-Cookie', `${NOME_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/** O usuário da requisição, ou null. Conta desativada não vale mais. */
function usuarioDaRequisicao(req) {
  const dados = lerToken(lerCookie(req, NOME_COOKIE));
  if (!dados) return null;

  const usuario = usuarios.porId(dados.usuarioId);
  if (!usuario || !usuario.ativo) return null;

  return usuario;
}

function estaAutenticado(req) {
  return Boolean(usuarioDaRequisicao(req));
}

/**
 * Protege páginas e arquivos. Quem não está autenticado vai para o login,
 * e volta para onde tentou entrar depois de entrar.
 */
function exigirLogin(req, res, next) {
  const usuario = usuarioDaRequisicao(req);

  if (!usuario) {
    const destino = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?destino=${destino}`);
  }

  req.usuario = usuario;
  // Disponível em toda view, sem precisar passar em cada res.render
  res.locals.usuario = usuario;
  res.locals.ehAdmin = usuario.papel === 'admin';
  next();
}

/** Barra quem não tem o papel. Use depois de exigirLogin. */
function exigirPapel(...papeis) {
  return (req, res, next) => {
    if (req.usuario && papeis.includes(req.usuario.papel)) return next();

    res.status(403).render('sem-permissao', {
      area: req.originalUrl,
      usuario: req.usuario || null,
      ehAdmin: false
    });
  };
}

const exigirAdmin = exigirPapel('admin');

module.exports = {
  exigirLogin,
  exigirPapel,
  exigirAdmin,
  estaAutenticado,
  usuarioDaRequisicao,
  definirCookieSessao,
  limparCookieSessao
};
