const db = require('../database');

/**
 * Reserva de unidade. Existe para responder "quem chegou primeiro?", que é
 * pergunta de comissão — por isso guarda quem reservou e quando, e por isso
 * exige um cliente de verdade em vez de um nome digitado na hora.
 */

function porId(unidadeId) {
  return db.prepare(`
    SELECT u.*, c.nome AS clienteNome, us.nome AS reservadoPorNome
    FROM unidades u
    LEFT JOIN clientes c ON c.id = u.clienteId
    LEFT JOIN usuarios us ON us.id = u.reservadoPor
    WHERE u.id = ?
  `).get(parseInt(unidadeId)) || null;
}

/**
 * Reserva a unidade para um cliente já cadastrado.
 * Só unidade livre pode ser reservada — o que impede dois corretores
 * venderem a mesma, que é o problema clássico.
 */
function reservar({ unidadeId, clienteId, usuario }) {
  const unidade = porId(unidadeId);
  if (!unidade) throw new Error('Unidade não encontrada.');

  if (unidade.status !== 'livre') {
    const dono = unidade.reservadoPorNome ? ` por ${unidade.reservadoPorNome}` : '';
    throw new Error(
      `A unidade ${unidade.numero} não está livre (${unidade.status}${dono}). ` +
      'Atualize a página para ver a situação atual.'
    );
  }

  const cliente = db.prepare('SELECT id, nome FROM clientes WHERE id = ?').get(parseInt(clienteId));
  if (!cliente) throw new Error('Escolha um cliente já cadastrado para reservar.');

  db.prepare(`
    UPDATE unidades
    SET status = 'negociacao', clienteId = ?, reservadoPor = ?, reservadoEm = datetime('now')
    WHERE id = ? AND status = 'livre'
  `).run([cliente.id, usuario.id, unidade.id]);

  // O vínculo precisa existir dos dois lados: a unidade aponta para o cliente,
  // e o cliente aponta para a unidade — senão a tela de Clientes segue dizendo
  // "Não vinculada" depois de uma reserva.
  db.prepare('UPDATE clientes SET unidadeId = ?, empreendimentoId = ? WHERE id = ?')
    .run([unidade.id, unidade.empreendimentoId, cliente.id]);

  return { unidade: unidade.numero, cliente: cliente.nome };
}

/** Quem reservou desfaz a própria; administrador desfaz qualquer uma. */
function podeLiberar(unidade, usuario) {
  if (!unidade) return false;
  if (usuario.papel === 'admin') return true;
  return unidade.reservadoPor === usuario.id;
}

function liberar({ unidadeId, usuario }) {
  const unidade = porId(unidadeId);
  if (!unidade) throw new Error('Unidade não encontrada.');

  if (unidade.status !== 'negociacao') {
    throw new Error(`A unidade ${unidade.numero} não está reservada.`);
  }

  if (!podeLiberar(unidade, usuario)) {
    const dono = unidade.reservadoPorNome || 'outro corretor';
    throw new Error(`Esta reserva é de ${dono}. Só ${dono} ou um administrador pode desfazer.`);
  }

  // Se já existe contrato para a unidade, desfazer a reserva esconderia uma
  // negociação em andamento. Melhor recusar e obrigar a tratar o contrato.
  const contratos = db.prepare(
    "SELECT COUNT(*) n FROM contratos WHERE unidadeId = ? AND status <> 'cancelado'"
  ).get(unidade.id).n;

  if (contratos > 0) {
    throw new Error(
      `A unidade ${unidade.numero} já tem ${contratos} contrato(s). ` +
      'Trate os contratos antes de liberar a unidade.'
    );
  }

  // Desfaz o vínculo dos dois lados, mas só se o cliente ainda aponta para
  // esta unidade — ele pode ter sido movido para outra no meio do caminho.
  if (unidade.clienteId) {
    db.prepare('UPDATE clientes SET unidadeId = NULL WHERE id = ? AND unidadeId = ?')
      .run([unidade.clienteId, unidade.id]);
  }

  db.prepare(`
    UPDATE unidades
    SET status = 'livre', clienteId = NULL, reservadoPor = NULL, reservadoEm = NULL
    WHERE id = ?
  `).run(unidade.id);

  return { unidade: unidade.numero };
}

module.exports = { reservar, liberar, porId, podeLiberar };
