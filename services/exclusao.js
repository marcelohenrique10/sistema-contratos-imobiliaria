const fs = require('fs');
const path = require('path');
const db = require('../database');

const STORAGE = require('../caminhos').STORAGE;

/**
 * Apaga o arquivo de um documento. Só remove o que está dentro de storage/,
 * para um caminho manipulado no banco não conseguir apagar outra coisa.
 */
function apagarArquivo(caminhoPublico) {
  const relativo = String(caminhoPublico || '').replace(/^\/storage\//, '');
  if (!relativo) return false;

  const destino = path.resolve(STORAGE, relativo);
  if (!destino.startsWith(path.resolve(STORAGE) + path.sep)) return false;

  try {
    if (fs.existsSync(destino)) {
      fs.unlinkSync(destino);
      return true;
    }
  } catch (_) { /* arquivo já removido ou em uso */ }

  return false;
}

/** O que seria removido junto — para mostrar antes de confirmar. */
function impactoCliente(clienteId) {
  const id = parseInt(clienteId);
  return {
    contratos: db.prepare('SELECT COUNT(*) n FROM contratos WHERE clienteId = ?').get(id).n,
    documentos: db.prepare('SELECT COUNT(*) n FROM documentos WHERE clienteId = ?').get(id).n,
    unidades: db.prepare('SELECT COUNT(*) n FROM unidades WHERE clienteId = ?').get(id).n,
    recebiveis: db.prepare(`
      SELECT COUNT(*) n FROM financeiro
      WHERE contratoId IN (SELECT id FROM contratos WHERE clienteId = ?)
    `).get(id).n
  };
}

function excluirCliente(clienteId) {
  const id = parseInt(clienteId);

  db.prepare(`
    DELETE FROM financeiro
    WHERE contratoId IN (SELECT id FROM contratos WHERE clienteId = ?)
  `).run(id);

  db.prepare('SELECT caminho FROM documentos WHERE clienteId = ?').all(id)
    .forEach((d) => apagarArquivo(d.caminho));
  db.prepare('DELETE FROM documentos WHERE clienteId = ?').run(id);

  db.prepare('DELETE FROM contratos WHERE clienteId = ?').run(id);

  // Unidades voltam a ficar livres
  db.prepare("UPDATE unidades SET clienteId = NULL, status = 'livre' WHERE clienteId = ?").run(id);

  db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
}

function excluirContrato(contratoId) {
  db.prepare('DELETE FROM financeiro WHERE contratoId = ?').run(String(contratoId));
  db.prepare('DELETE FROM contratos WHERE id = ?').run(String(contratoId));
}

function excluirDocumento(documentoId) {
  const id = parseInt(documentoId);
  const doc = db.prepare('SELECT caminho FROM documentos WHERE id = ?').get(id);
  if (doc) apagarArquivo(doc.caminho);
  db.prepare('DELETE FROM documentos WHERE id = ?').run(id);
}

function impactoEmpreendimento(empreendimentoId) {
  return {
    unidades: db.prepare('SELECT COUNT(*) n FROM unidades WHERE empreendimentoId = ?').get(empreendimentoId).n,
    contratos: db.prepare('SELECT COUNT(*) n FROM contratos WHERE empreendimentoId = ?').get(empreendimentoId).n,
    documentos: db.prepare('SELECT COUNT(*) n FROM documentos WHERE empreendimentoId = ?').get(empreendimentoId).n,
    financeiro: db.prepare('SELECT COUNT(*) n FROM financeiro WHERE empreendimentoId = ?').get(empreendimentoId).n,
    clientes: db.prepare('SELECT COUNT(*) n FROM clientes WHERE empreendimentoId = ?').get(empreendimentoId).n
  };
}

/**
 * Remove o empreendimento e tudo que dependia dele. Antes, a exclusão apagava
 * só a linha do empreendimento e deixava o resto órfão no banco.
 */
function excluirEmpreendimento(empreendimentoId) {
  const id = String(empreendimentoId);

  db.prepare('SELECT caminho FROM documentos WHERE empreendimentoId = ?').all(id)
    .forEach((d) => apagarArquivo(d.caminho));

  db.prepare('DELETE FROM documentos WHERE empreendimentoId = ?').run(id);
  db.prepare('DELETE FROM financeiro WHERE empreendimentoId = ?').run(id);
  db.prepare('DELETE FROM contratos WHERE empreendimentoId = ?').run(id);
  db.prepare('DELETE FROM unidades WHERE empreendimentoId = ?').run(id);

  // O cliente continua existindo, apenas desvinculado
  db.prepare('UPDATE clientes SET empreendimentoId = NULL, unidadeId = NULL WHERE empreendimentoId = ?').run(id);

  db.prepare('DELETE FROM empreendimentos WHERE id = ?').run(id);
}

module.exports = {
  impactoCliente, excluirCliente,
  excluirContrato, excluirDocumento,
  impactoEmpreendimento, excluirEmpreendimento,
  apagarArquivo
};
