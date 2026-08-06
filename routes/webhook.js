const express = require('express');
const router = express.Router();
const db = require('../database');
const { gerarDocumento } = require('../services/documento');

function checkAuth(req, res, next) {
  if (!process.env.WEBHOOK_SECRET) {
    return res.status(500).json({ sucesso: false, erro: 'WEBHOOK_SECRET não configurado no servidor' });
  }

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ sucesso: false, erro: 'Token inválido' });
  }
  next();
}

function logWebhook(tipo, payload, status, erro = null) {
  db.prepare(
    'INSERT INTO webhook_logs (tipo, payload, status, erro) VALUES (?, ?, ?, ?)'
  ).run([tipo, JSON.stringify(payload), status, erro]);
}

// O formulário informa o número da unidade ("1001"), não o id do banco.
function resolverUnidadeId({ unidadeId, unidadeNumero, empreendimentoId }) {
  if (unidadeId) return parseInt(unidadeId);
  if (!unidadeNumero || !empreendimentoId) return null;

  const unidade = db.prepare(
    'SELECT id FROM unidades WHERE empreendimentoId = ? AND TRIM(numero) = TRIM(?)'
  ).get([empreendimentoId, String(unidadeNumero)]);

  return unidade ? unidade.id : null;
}

// Remove o prefixo numérico da lista suspensa do formulário ("1. Contrato..." -> "Contrato...")
function normalizarTipoDocumento(tipo) {
  return String(tipo || '').replace(/^\s*\d+\s*[.)-]\s*/, '').trim();
}

router.post('/cliente', checkAuth, (req, res) => {
  const { nome, cpfCnpj, telefone, email, tipo, observacoes, empreendimentoId, unidadeNumero } = req.body;

  if (!nome) {
    logWebhook('cliente', req.body, 'erro', 'Campo obrigatório ausente: nome');
    return res.status(400).json({ sucesso: false, erro: 'Campo obrigatório ausente: nome' });
  }

  try {
    const unidadeId = resolverUnidadeId({ unidadeId: req.body.unidadeId, unidadeNumero, empreendimentoId });

    // Reenvio da mesma resposta do formulário não deve duplicar o cliente.
    const existente = cpfCnpj
      ? db.prepare('SELECT id FROM clientes WHERE cpfCnpj = ?').get(cpfCnpj)
      : null;

    let clienteId;

    if (existente) {
      clienteId = existente.id;
      logWebhook('cliente', req.body, 'sucesso', 'Cliente já existente, reaproveitado');
    } else {
      const result = db.prepare(
        'INSERT INTO clientes (nome, cpfCnpj, telefone, email, tipo, observacoes, empreendimentoId, unidadeId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run([nome, cpfCnpj || null, telefone || null, email || null, tipo || 'Comprador', observacoes || null, empreendimentoId || null, unidadeId]);

      clienteId = Number(result.lastInsertRowid);
      logWebhook('cliente', req.body, 'sucesso');
    }

    if (unidadeId) {
      db.prepare('UPDATE unidades SET clienteId = ?, status = ? WHERE id = ?').run([clienteId, 'negociacao', unidadeId]);
    }

    res.json({ sucesso: true, id: clienteId, unidadeId, jaExistia: Boolean(existente) });
  } catch (err) {
    logWebhook('cliente', req.body, 'erro', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/contrato', checkAuth, (req, res) => {
  const { clienteId, empreendimentoId, unidadeNumero, categoria, nome } = req.body;

  if (!clienteId) {
    logWebhook('contrato', req.body, 'erro', 'Campo obrigatório ausente: clienteId');
    return res.status(400).json({ sucesso: false, erro: 'Campo obrigatório ausente: clienteId' });
  }

  try {
    const unidadeId = resolverUnidadeId({ unidadeId: req.body.unidadeId, unidadeNumero, empreendimentoId });
    const categoriaNormalizada = normalizarTipoDocumento(categoria);
    const nomeNormalizado = normalizarTipoDocumento(nome);

    const id = `wh-${Date.now()}`;
    db.prepare(
      'INSERT INTO contratos (id, nome, categoria, empreendimentoId, unidadeId, clienteId, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run([id, nomeNormalizado, categoriaNormalizada || null, empreendimentoId || null, unidadeId, parseInt(clienteId), 'em_preenchimento']);

    logWebhook('contrato', req.body, 'sucesso');
    res.json({ sucesso: true, id, unidadeId });
  } catch (err) {
    logWebhook('contrato', req.body, 'erro', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/financeiro', checkAuth, (req, res) => {
  const { empreendimentoId, categoria, tipo, valor, data, observacao } = req.body;

  try {
    const tipoNormalizado = (tipo || '').toLowerCase();
    const result = db.prepare(
      'INSERT INTO financeiro (empreendimentoId, categoria, tipo, valor, data, observacao) VALUES (?, ?, ?, ?, ?, ?)'
    ).run([empreendimentoId || null, categoria || null, tipoNormalizado, valor, data || null, observacao || null]);

    const novoId = Number(result.lastInsertRowid);

    logWebhook('financeiro', req.body, 'sucesso');
    res.json({ sucesso: true, id: novoId });
  } catch (err) {
    logWebhook('financeiro', req.body, 'erro', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.post('/unidade-status', checkAuth, (req, res) => {
  const { unidadeId, status, clienteId } = req.body;

  const statusValidos = ['livre', 'negociacao', 'vendido', 'permutado', 'cancelado'];
  if (!statusValidos.includes(status)) {
    logWebhook('unidade-status', req.body, 'erro', `Status inválido: ${status}`);
    return res.status(400).json({ sucesso: false, erro: `Status inválido: ${status}` });
  }

  try {
    db.prepare('UPDATE unidades SET status = ?, clienteId = ? WHERE id = ?').run([status, clienteId || null, unidadeId]);

    logWebhook('unidade-status', req.body, 'sucesso');
    res.json({ sucesso: true, id: unidadeId });
  } catch (err) {
    logWebhook('unidade-status', req.body, 'erro', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// Recebe o objeto `documento` montado pelo nó "Extrair Campos" do n8n,
// gera o arquivo a partir do modelo e registra na tela de Documentos.
router.post('/documento', checkAuth, async (req, res) => {
  const { documento, empreendimentoId, unidadeNumero, clienteId, contratoId } = req.body;

  if (!documento || !documento.tipo) {
    logWebhook('documento', req.body, 'erro', 'Payload sem documento.tipo');
    return res.status(400).json({ sucesso: false, erro: 'Payload sem documento.tipo' });
  }

  try {
    const empreendimento = empreendimentoId
      ? db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(empreendimentoId)
      : null;

    const resultado = await gerarDocumento({ documento, empreendimento, empreendimentoId, unidadeNumero });
    const unidadeId = resolverUnidadeId({ unidadeId: req.body.unidadeId, unidadeNumero, empreendimentoId });

    const insercao = db.prepare(
      'INSERT INTO documentos (tipo, nome, empreendimentoId, unidadeId, clienteId, caminho, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run([
      normalizarTipoDocumento(documento.tipo),
      `${normalizarTipoDocumento(documento.tipo)} - ${(documento.comprador || {}).nome || 'sem nome'}`,
      empreendimentoId || null,
      unidadeId,
      clienteId ? parseInt(clienteId) : null,
      resultado.caminhoPublico,
      new Date().toISOString().slice(0, 10)
    ]);

    if (contratoId) {
      db.prepare('UPDATE contratos SET status = ? WHERE id = ?').run(['gerado', contratoId]);
    }

    logWebhook('documento', req.body, 'sucesso');
    res.json({
      sucesso: true,
      id: Number(insercao.lastInsertRowid),
      arquivo: resultado.caminhoPublico,
      camposSemValor: resultado.placeholdersSemValor
    });
  } catch (err) {
    logWebhook('documento', req.body, 'erro', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

router.get('/logs', checkAuth, (req, res) => {
  const logs = db.prepare('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 50').all();
  res.json({ sucesso: true, logs });
});

module.exports = router;
