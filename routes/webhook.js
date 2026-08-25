const express = require('express');
const router = express.Router();
const db = require('../database');
const { gerarDocumento } = require('../services/documento');
const { registrarRecebiveis } = require('../services/recebiveis');

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

// O formulário devolve o NOME do empreendimento ("High Tower Jardins"),
// mas o sistema trabalha com o id ("high-tower").
function resolverEmpreendimentoId({ empreendimentoId, empreendimentoNome }) {
  if (empreendimentoId) {
    const porId = db.prepare('SELECT id FROM empreendimentos WHERE id = ?').get(empreendimentoId);
    if (porId) return porId.id;
  }

  const nome = (empreendimentoNome || empreendimentoId || '').trim();
  if (!nome) return null;

  const porNome = db.prepare(
    'SELECT id FROM empreendimentos WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))'
  ).get(nome);

  return porNome ? porNome.id : null;
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
  const { nome, cpfCnpj, telefone, email, tipo, observacoes, unidadeNumero } = req.body;
  const empreendimentoId = resolverEmpreendimentoId(req.body);

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
  const { clienteId, unidadeNumero, categoria, nome, respostaId } = req.body;
  const empreendimentoId = resolverEmpreendimentoId(req.body);

  if (!clienteId) {
    logWebhook('contrato', req.body, 'erro', 'Campo obrigatório ausente: clienteId');
    return res.status(400).json({ sucesso: false, erro: 'Campo obrigatório ausente: clienteId' });
  }

  try {
    const unidadeId = resolverUnidadeId({ unidadeId: req.body.unidadeId, unidadeNumero, empreendimentoId });
    const categoriaNormalizada = normalizarTipoDocumento(categoria);
    const nomeNormalizado = normalizarTipoDocumento(nome);

    // Reprocessar a mesma resposta do formulário não deve criar outro contrato.
    if (respostaId) {
      const jaProcessado = db.prepare(
        'SELECT id, unidadeId FROM contratos WHERE respostaId = ? AND TRIM(nome) = TRIM(?)'
      ).get([String(respostaId), nomeNormalizado]);

      if (jaProcessado) {
        logWebhook('contrato', req.body, 'sucesso', 'Resposta já processada, contrato reaproveitado');
        return res.json({ sucesso: true, id: jaProcessado.id, unidadeId: jaProcessado.unidadeId, jaProcessado: true });
      }
    }

    // O nome do contrato traz o cliente junto ("Termo X - Fulano"), mas o
    // pendente criado pelo sistema guarda só o nome do documento.
    const tipoDocumento = nomeNormalizado.split(' - ')[0].trim();

    // "Iniciar processo de venda" já pode ter criado este documento como
    // pendente. Nesse caso preenchemos aquele, em vez de criar um duplicado.
    const pendente = db.prepare(`
      SELECT id FROM contratos
      WHERE clienteId = ? AND status = 'pendente' AND TRIM(nome) = TRIM(?)
      ORDER BY created_at
      LIMIT 1
    `).get([parseInt(clienteId), tipoDocumento]);

    if (pendente) {
      db.prepare(
        'UPDATE contratos SET status = ?, categoria = ?, empreendimentoId = COALESCE(?, empreendimentoId), unidadeId = COALESCE(?, unidadeId), respostaId = ? WHERE id = ?'
      ).run(['em_preenchimento', categoriaNormalizada || null, empreendimentoId || null, unidadeId, respostaId || null, pendente.id]);

      logWebhook('contrato', req.body, 'sucesso', 'Contrato pendente preenchido');
      return res.json({ sucesso: true, id: pendente.id, unidadeId, preencheuPendente: true });
    }

    const id = `wh-${Date.now()}`;
    db.prepare(
      'INSERT INTO contratos (id, nome, categoria, empreendimentoId, unidadeId, clienteId, status, respostaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run([id, nomeNormalizado, categoriaNormalizada || null, empreendimentoId || null, unidadeId, parseInt(clienteId), 'em_preenchimento', respostaId || null]);

    logWebhook('contrato', req.body, 'sucesso');
    res.json({ sucesso: true, id, unidadeId, preencheuPendente: false });
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
  const { documento, unidadeNumero, clienteId, contratoId, respostaId } = req.body;
  const empreendimentoId = resolverEmpreendimentoId(req.body);

  if (!documento || !documento.tipo) {
    logWebhook('documento', req.body, 'erro', 'Payload sem documento.tipo');
    return res.status(400).json({ sucesso: false, erro: 'Payload sem documento.tipo' });
  }

  try {
    // Mesma resposta reprocessada devolve o documento já gerado, em vez de
    // criar outro arquivo e outro cronograma de recebíveis.
    if (respostaId) {
      const jaGerado = db.prepare(
        'SELECT id, caminho FROM documentos WHERE respostaId = ? AND tipo = ?'
      ).get([String(respostaId), normalizarTipoDocumento(documento.tipo)]);

      if (jaGerado) {
        logWebhook('documento', req.body, 'sucesso', 'Resposta já processada, documento reaproveitado');
        return res.json({
          sucesso: true, id: jaGerado.id, arquivo: jaGerado.caminho,
          camposSemValor: [], jaProcessado: true
        });
      }
    }

    const empreendimento = empreendimentoId
      ? db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(empreendimentoId)
      : null;

    const resultado = await gerarDocumento({ documento, empreendimento, empreendimentoId, unidadeNumero });
    const unidadeId = resolverUnidadeId({ unidadeId: req.body.unidadeId, unidadeNumero, empreendimentoId });

    const insercao = db.prepare(
      'INSERT INTO documentos (tipo, nome, empreendimentoId, unidadeId, clienteId, caminho, data, respostaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run([
      normalizarTipoDocumento(documento.tipo),
      `${normalizarTipoDocumento(documento.tipo)} - ${(documento.comprador || {}).nome || 'sem nome'}`,
      empreendimentoId || null,
      unidadeId,
      clienteId ? parseInt(clienteId) : null,
      resultado.caminhoPublico,
      new Date().toISOString().slice(0, 10),
      respostaId || null
    ]);

    if (contratoId) {
      db.prepare('UPDATE contratos SET status = ? WHERE id = ?').run(['gerado', contratoId]);
    }

    // As parcelas do contrato viram cronograma de recebíveis no financeiro.
    const recebiveis = registrarRecebiveis({
      contratoId,
      empreendimentoId,
      compraVenda: documento.compraVenda
    });

    logWebhook('documento', req.body, 'sucesso');
    res.json({
      sucesso: true,
      id: Number(insercao.lastInsertRowid),
      arquivo: resultado.caminhoPublico,
      camposSemValor: resultado.placeholdersSemValor,
      recebiveis
    });
  } catch (err) {
    logWebhook('documento', req.body, 'erro', err.message);
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// Lista os empreendimentos ativos para o formulário manter o menu suspenso
// em dia. Consumido pelo Apps Script (ver forms/README.md).
router.get('/empreendimentos', checkAuth, (req, res) => {
  const lista = db.prepare(
    "SELECT id, nome FROM empreendimentos WHERE status <> 'concluido' ORDER BY nome"
  ).all();

  res.json({ sucesso: true, empreendimentos: lista });
});

router.get('/logs', checkAuth, (req, res) => {
  const logs = db.prepare('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 50').all();
  res.json({ sucesso: true, logs });
});

module.exports = router;
