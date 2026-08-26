const db = require('../database');

/**
 * O formulário pode chegar antes de alguém iniciar o processo de venda. Nesse
 * caso o documento já existe, preso a um contrato avulso criado pelo webhook,
 * e o pendente recém-criado ficaria esperando para sempre um documento que
 * já está pronto.
 *
 * Aqui o pendente adota o documento que já existe.
 */

// Contratos avulsos nascem no webhook com id "wh-...". Os de uma operação
// nascem como "op-...". Só os avulsos podem ser absorvidos: eles não têm
// operação própria para defender.
function ehAvulso(contratoId) {
  return String(contratoId || '').startsWith('wh-');
}

/**
 * Documento deste cliente, deste tipo, que ainda não pertence a nenhuma
 * operação. O mais recente ganha: se houve reenvio, é o que vale.
 */
function documentoDisponivel(clienteId, tipoDocumento) {
  return db.prepare(`
    SELECT d.id, d.contratoId, d.origem
    FROM documentos d
    WHERE d.clienteId = ?
      AND TRIM(d.tipo) = TRIM(?)
      AND (d.contratoId IS NULL OR d.contratoId LIKE 'wh-%')
    ORDER BY d.id DESC
    LIMIT 1
  `).get([parseInt(clienteId), tipoDocumento]);
}

/**
 * Transfere o que estava pendurado no contrato avulso e o remove. Os
 * lançamentos financeiros vão junto — apagar o avulso sem mover levaria o
 * cronograma de recebíveis embora.
 */
function absorverAvulso(avulsoId, novoContratoId) {
  if (!ehAvulso(avulsoId)) return false;

  db.prepare('UPDATE financeiro SET contratoId = ? WHERE contratoId = ?')
    .run([novoContratoId, avulsoId]);

  db.prepare('UPDATE documentos SET contratoId = ? WHERE contratoId = ?')
    .run([novoContratoId, avulsoId]);

  db.prepare('DELETE FROM contratos WHERE id = ?').run(avulsoId);
  return true;
}

/**
 * Chamado logo depois de criar os pendentes de uma operação.
 * Devolve o que foi aproveitado, para a tela poder contar.
 */
function aproveitarDocumentosExistentes({ clienteId, contratos }) {
  const aproveitados = [];

  for (const contrato of contratos) {
    const documento = documentoDisponivel(clienteId, contrato.nome);
    if (!documento) continue;

    // Documento vindo de fora foi "anexado"; gerado pelo sistema foi "gerado".
    const status = documento.origem === 'enviado' ? 'anexado' : 'gerado';

    db.prepare('UPDATE documentos SET contratoId = ? WHERE id = ?')
      .run([contrato.id, documento.id]);
    db.prepare('UPDATE contratos SET status = ? WHERE id = ?')
      .run([status, contrato.id]);

    const absorveu = documento.contratoId && documento.contratoId !== contrato.id
      ? absorverAvulso(documento.contratoId, contrato.id)
      : false;

    aproveitados.push({ contrato: contrato.nome, documentoId: documento.id, status, absorveu });
  }

  return aproveitados;
}

module.exports = { aproveitarDocumentosExistentes, documentoDisponivel, ehAvulso };
