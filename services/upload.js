const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const unidades = require('./unidades');

const STORAGE = path.join(__dirname, '..', 'storage', 'documentos');

// Só formatos de documento e imagem de digitalização. Nada executável.
const EXTENSOES = ['.pdf', '.docx', '.doc', '.odt', '.jpg', '.jpeg', '.png'];
const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20 MB

const TIPOS_DOCUMENTO = [
  'Contrato de Promessa de Compra e Venda',
  'Anexo ao Contrato de Promessa de Compra e Venda',
  'Termo de Anuência com Outorga de Poderes',
  'Termo de Ciência e Anuência para Empréstimo',
  'Termo de Adesão Preliminar SCP',
  'Contrato de Permuta',
  'Procuração',
  'Documento pessoal',
  'Comprovante',
  'Outro'
];

function apelidar(texto, limite = 60) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, limite) || 'documento';
}

// O nome que chega do navegador nunca é usado no disco: viraria caminho
// arbitrário. Guardamos o original só como texto, para exibir.
const armazenamento = multer.diskStorage({
  destination(req, file, cb) {
    const empreendimentoId = apelidar(req.body.empreendimentoId || 'sem-empreendimento');
    const pasta = path.join(STORAGE, empreendimentoId, 'enviados');
    fs.mkdirSync(pasta, { recursive: true });
    cb(null, pasta);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${apelidar(req.body.tipo || 'documento')}-${Date.now()}${ext}`);
  }
});

const receber = multer({
  storage: armazenamento,
  limits: { fileSize: TAMANHO_MAXIMO, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES.includes(ext)) {
      return cb(new Error(`Formato não aceito (${ext || 'sem extensão'}). Use PDF, Word ou imagem.`));
    }
    cb(null, true);
  }
}).single('arquivo');

/**
 * Resolve cliente, empreendimento e unidade, criando o que não existir.
 * Devolve os ids para vincular o documento.
 */
function resolverVinculos(corpo) {
  let { clienteId, empreendimentoId, unidadeId } = corpo;

  // ---- Empreendimento ----
  if (corpo.empreendimentoModo === 'novo') {
    const nome = (corpo.empreendimentoNome || '').trim();
    if (!nome) throw new Error('Informe o nome do empreendimento novo.');

    empreendimentoId = apelidar(nome);
    const existe = db.prepare('SELECT 1 FROM empreendimentos WHERE id = ?').get(empreendimentoId);

    if (!existe) {
      db.prepare(
        "INSERT INTO empreendimentos (id, nome, status) VALUES (?, ?, 'ativo')"
      ).run([empreendimentoId, nome]);
    }
  }

  if (!empreendimentoId) throw new Error('Escolha o empreendimento.');

  // ---- Unidade ----
  if (corpo.unidadeModo === 'nova') {
    const numero = (corpo.unidadeNumero || '').trim();
    if (!numero) throw new Error('Informe o número da unidade nova.');

    const jaExiste = db.prepare(
      'SELECT id FROM unidades WHERE empreendimentoId = ? AND TRIM(numero) = TRIM(?)'
    ).get([empreendimentoId, numero]);

    if (jaExiste) {
      unidadeId = jaExiste.id;
    } else {
      unidades.criar({
        empreendimentoId,
        numero,
        pavimento: corpo.unidadePavimento,
        tipologia: corpo.unidadeTipologia,
        status: 'negociacao'
      });
      unidadeId = db.prepare(
        'SELECT id FROM unidades WHERE empreendimentoId = ? AND TRIM(numero) = TRIM(?)'
      ).get([empreendimentoId, numero]).id;
    }
  }

  // ---- Cliente ----
  if (corpo.clienteModo === 'novo') {
    const nome = (corpo.clienteNome || '').trim();
    if (!nome) throw new Error('Informe o nome do cliente novo.');

    const documento = (corpo.clienteCpfCnpj || '').trim();
    const existente = documento
      ? db.prepare('SELECT id FROM clientes WHERE cpfCnpj = ?').get(documento)
      : null;

    if (existente) {
      clienteId = existente.id;
    } else {
      const r = db.prepare(
        'INSERT INTO clientes (nome, cpfCnpj, telefone, email, tipo, empreendimentoId, unidadeId) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run([
        nome, documento || null, corpo.clienteTelefone || null, corpo.clienteEmail || null,
        'Comprador', empreendimentoId, unidadeId ? parseInt(unidadeId) : null
      ]);
      clienteId = Number(r.lastInsertRowid);
    }
  }

  if (!clienteId) throw new Error('Escolha o cliente.');

  // Vincula a unidade ao cliente, se ainda estiver solta
  if (unidadeId) {
    db.prepare(
      "UPDATE unidades SET clienteId = ?, status = CASE WHEN status = 'livre' THEN 'negociacao' ELSE status END WHERE id = ? AND clienteId IS NULL"
    ).run([parseInt(clienteId), parseInt(unidadeId)]);
  }

  return {
    clienteId: parseInt(clienteId),
    empreendimentoId,
    unidadeId: unidadeId ? parseInt(unidadeId) : null
  };
}

/**
 * Contratos deste cliente que ainda esperam documento. O upload pode
 * satisfazer um deles, do mesmo jeito que a resposta do formulário faz.
 */
function contratosPendentes(clienteId) {
  return db.prepare(`
    SELECT id, nome, categoria, status
    FROM contratos
    WHERE clienteId = ? AND status IN ('pendente', 'em_preenchimento')
    ORDER BY created_at
  `).all(parseInt(clienteId));
}

function registrar({ vinculos, tipo, arquivo, contratoId }) {
  const caminhoPublico = '/storage/' + path
    .relative(path.join(__dirname, '..', 'storage'), arquivo.path)
    .replace(/\\/g, '/');

  const cliente = db.prepare('SELECT nome FROM clientes WHERE id = ?').get(vinculos.clienteId);

  // Só aceita contrato que seja mesmo deste cliente
  const contrato = contratoId
    ? db.prepare('SELECT id FROM contratos WHERE id = ? AND clienteId = ?')
        .get([String(contratoId), vinculos.clienteId])
    : null;

  const r = db.prepare(`
    INSERT INTO documentos (tipo, nome, empreendimentoId, unidadeId, clienteId, caminho, data, origem, nomeOriginal, contratoId)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'enviado', ?, ?)
  `).run([
    tipo,
    `${tipo} - ${cliente ? cliente.nome : 'sem cliente'}`,
    vinculos.empreendimentoId,
    vinculos.unidadeId,
    vinculos.clienteId,
    caminhoPublico,
    new Date().toISOString().slice(0, 10),
    arquivo.originalname,
    contrato ? contrato.id : null
  ]);

  // O contrato deixa de esperar: o documento chegou, só que de fora.
  if (contrato) {
    db.prepare("UPDATE contratos SET status = 'anexado' WHERE id = ?").run(contrato.id);
  }

  return { id: Number(r.lastInsertRowid), caminhoPublico, contratoAtendido: Boolean(contrato) };
}

module.exports = {
  receber, resolverVinculos, registrar, contratosPendentes,
  TIPOS_DOCUMENTO, EXTENSOES, TAMANHO_MAXIMO, apelidar
};
