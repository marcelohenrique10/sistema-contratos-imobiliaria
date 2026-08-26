const crypto = require('crypto');

const NOME_COOKIE = 'sessao';
const DURACAO_HORAS = 12;

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
 * Cria um token assinado com validade. Não guardamos sessão em memória: o
 * próprio cookie carrega a validade, e a assinatura impede adulteração.
 * Assim o login sobrevive a reinícios do servidor.
 */
function criarToken() {
  const expiraEm = Date.now() + DURACAO_HORAS * 60 * 60 * 1000;
  const dados = String(expiraEm);
  return `${dados}.${assinar(dados)}`;
}

function tokenValido(token) {
  if (!token || !token.includes('.')) return false;

  const [dados, assinatura] = token.split('.');
  const esperada = assinar(dados);

  // Comparação em tempo constante evita vazar informação pelo tempo de resposta
  const a = Buffer.from(assinatura || '');
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  return Number(dados) > Date.now();
}

function lerCookie(req, nome) {
  const bruto = req.headers.cookie || '';
  const par = bruto.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${nome}=`));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : null;
}

function senhaConfere(informada) {
  const correta = process.env.APP_SENHA || '';
  if (!correta) return false;

  const a = Buffer.from(String(informada || ''));
  const b = Buffer.from(correta);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function definirCookieSessao(res) {
  const partes = [
    `${NOME_COOKIE}=${criarToken()}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${DURACAO_HORAS * 60 * 60}`
  ];
  // Em produção o cookie só trafega por HTTPS
  if (process.env.NODE_ENV === 'production') partes.push('Secure');

  res.setHeader('Set-Cookie', partes.join('; '));
}

function limparCookieSessao(res) {
  res.setHeader('Set-Cookie', `${NOME_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function estaAutenticado(req) {
  return tokenValido(lerCookie(req, NOME_COOKIE));
}

/**
 * Protege páginas e arquivos. Quem não está autenticado vai para o login,
 * e volta para onde tentou entrar depois de entrar.
 */
function exigirLogin(req, res, next) {
  if (estaAutenticado(req)) return next();

  const destino = encodeURIComponent(req.originalUrl || '/');
  res.redirect(`/login?destino=${destino}`);
}

module.exports = {
  exigirLogin,
  estaAutenticado,
  senhaConfere,
  definirCookieSessao,
  limparCookieSessao
};
