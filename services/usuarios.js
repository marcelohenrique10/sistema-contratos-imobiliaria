const crypto = require('crypto');
const db = require('../database');

const PAPEIS = ['admin', 'corretor'];

// Quanto tempo a sessão dura, por papel. Corretor usa no celular, em campo,
// na frente do comprador — digitar senha todo dia ali é atrito real.
// Administrador mexe em dinheiro, então a sessão é curta de propósito.
const HORAS_SESSAO = { corretor: 30 * 24, admin: 12 };

/**
 * Guarda a senha como `salt:hash`. O scrypt vem do próprio Node — não
 * precisamos de dependência nova, e ele é lento de propósito: quem roubar
 * o banco não testa senhas em série.
 */
function gerarHash(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivada = crypto.scryptSync(String(senha), sal, 64).toString('hex');
  return `${sal}:${derivada}`;
}

function senhaConfere(senha, guardado) {
  const [sal, esperado] = String(guardado || '').split(':');
  if (!sal || !esperado) return false;

  const derivada = crypto.scryptSync(String(senha ?? ''), sal, 64).toString('hex');
  const a = Buffer.from(derivada, 'hex');
  const b = Buffer.from(esperado, 'hex');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizarLogin(valor) {
  return String(valor || '').trim().toLowerCase();
}

function porLogin(login) {
  return db.prepare('SELECT * FROM usuarios WHERE login = ?').get(normalizarLogin(login)) || null;
}

function porId(id) {
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(parseInt(id)) || null;
}

/**
 * Acha o usuário pelo nome escrito à mão — é assim que o "Responsável interno
 * pelo preenchimento" do formulário vira o dono do cliente.
 *
 * Compara ignorando acento, caixa e espaço repetido. Só aceita quando há UM
 * candidato: dois "Ana" no cadastro dariam o cliente ao corretor errado, e
 * errar o dono é pior do que não ter dono.
 */
function porNomeAproximado(nome) {
  const alvo = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

  if (!alvo) return null;

  const candidatos = db.prepare('SELECT id, nome FROM usuarios WHERE ativo = 1').all()
    .filter((u) => String(u.nome)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toLowerCase().replace(/\s+/g, ' ') === alvo);

  return candidatos.length === 1 ? candidatos[0] : null;
}

function listar() {
  return db.prepare(
    'SELECT id, nome, login, papel, ativo, created_at FROM usuarios ORDER BY papel, nome'
  ).all();
}

/**
 * Confere as credenciais. Devolve o usuário ou null — nunca diz qual das
 * duas partes estava errada, para não confirmar quais logins existem.
 */
function autenticar(login, senha) {
  const usuario = porLogin(login);
  if (!usuario || !usuario.ativo) return null;
  if (!senhaConfere(senha, usuario.senhaHash)) return null;
  return usuario;
}

function criar({ nome, login, senha, papel }) {
  const nomeLimpo = String(nome || '').trim();
  const loginLimpo = normalizarLogin(login);

  if (!nomeLimpo) throw new Error('Informe o nome.');
  if (!loginLimpo) throw new Error('Informe o login.');
  if (!PAPEIS.includes(papel)) throw new Error('Papel inválido.');
  if (String(senha || '').length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
  if (porLogin(loginLimpo)) throw new Error(`Já existe usuário com o login "${loginLimpo}".`);

  const r = db.prepare(
    'INSERT INTO usuarios (nome, login, senhaHash, papel, ativo) VALUES (?, ?, ?, ?, 1)'
  ).run([nomeLimpo, loginLimpo, gerarHash(senha), papel]);

  return Number(r.lastInsertRowid);
}

function trocarSenha(id, senha) {
  if (String(senha || '').length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
  db.prepare('UPDATE usuarios SET senhaHash = ? WHERE id = ?').run([gerarHash(senha), parseInt(id)]);
}

/**
 * Desativar em vez de apagar: o histórico de quem reservou o quê continua
 * fazendo sentido depois que a pessoa sai.
 */
function definirAtivo(id, ativo) {
  const alvo = porId(id);
  if (!alvo) throw new Error('Usuário não encontrado.');

  // Sem isto, dá para desativar o último administrador e ninguém mais entra.
  if (alvo.papel === 'admin' && !ativo) {
    const outros = db.prepare(
      "SELECT COUNT(*) n FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND id <> ?"
    ).get(parseInt(id)).n;
    if (outros === 0) throw new Error('Este é o último administrador ativo. Crie outro antes de desativar.');
  }

  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run([ativo ? 1 : 0, parseInt(id)]);
}

function horasDeSessao(papel) {
  return HORAS_SESSAO[papel] || HORAS_SESSAO.admin;
}

module.exports = {
  PAPEIS, autenticar, criar, listar, porId, porLogin, porNomeAproximado,
  trocarSenha, definirAtivo, gerarHash, horasDeSessao
};
