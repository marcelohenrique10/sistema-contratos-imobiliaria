const db = require('../database');

const STATUS_VALIDOS = ['livre', 'negociacao', 'vendido', 'permutado', 'cancelado'];

function numeroExiste(empreendimentoId, numero) {
  return Boolean(db.prepare(
    'SELECT 1 FROM unidades WHERE empreendimentoId = ? AND TRIM(numero) = TRIM(?)'
  ).get([empreendimentoId, String(numero)]));
}

function criar({ empreendimentoId, numero, pavimento, tipologia, metragem, status }) {
  const num = String(numero || '').trim();
  if (!num) throw new Error('Informe o número da unidade.');

  if (numeroExiste(empreendimentoId, num)) {
    throw new Error(`Já existe a unidade ${num} neste empreendimento.`);
  }

  const st = STATUS_VALIDOS.includes(status) ? status : 'livre';

  db.prepare(
    'INSERT INTO unidades (empreendimentoId, numero, pavimento, tipologia, metragem, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run([empreendimentoId, num, pavimento || null, tipologia || null, metragem || null, st]);
}

/**
 * Gera unidades de vários pavimentos de uma vez, seguindo a numeração já usada
 * nos empreendimentos: pavimento + índice com dois dígitos.
 * Ex.: pavimentos 9 a 10, 2 por andar -> 901, 902, 1001, 1002.
 *
 * Números que já existem são pulados, não sobrescritos.
 */
function criarEmLote({ empreendimentoId, pavimentoInicial, pavimentoFinal, porPavimento, tipologia, metragem }) {
  const de = parseInt(pavimentoInicial);
  const ate = parseInt(pavimentoFinal);
  const qtd = parseInt(porPavimento);

  if (!Number.isFinite(de) || !Number.isFinite(ate) || !Number.isFinite(qtd)) {
    throw new Error('Preencha os pavimentos e a quantidade por pavimento com números.');
  }
  if (de < 1 || ate < de) throw new Error('O pavimento final precisa ser maior ou igual ao inicial.');
  if (qtd < 1 || qtd > 20) throw new Error('A quantidade por pavimento deve ficar entre 1 e 20.');
  if ((ate - de + 1) * qtd > 500) throw new Error('Esse intervalo geraria mais de 500 unidades. Divida em partes.');

  const ins = db.prepare(
    'INSERT INTO unidades (empreendimentoId, numero, pavimento, tipologia, metragem, status) VALUES (?, ?, ?, ?, ?, ?)'
  );

  let criadas = 0;
  const puladas = [];

  for (let pav = de; pav <= ate; pav++) {
    for (let i = 1; i <= qtd; i++) {
      const numero = `${pav}${String(i).padStart(2, '0')}`;

      if (numeroExiste(empreendimentoId, numero)) {
        puladas.push(numero);
        continue;
      }

      ins.run([empreendimentoId, numero, `${pav}º`, tipologia || null, metragem || null, 'livre']);
      criadas++;
    }
  }

  return { criadas, puladas };
}

function atualizar(id, { numero, pavimento, tipologia, metragem, status }) {
  const unidadeId = parseInt(id);
  const atual = db.prepare('SELECT * FROM unidades WHERE id = ?').get(unidadeId);
  if (!atual) throw new Error('Unidade não encontrada.');

  const num = String(numero || '').trim();
  if (!num) throw new Error('Informe o número da unidade.');

  const conflito = db.prepare(
    'SELECT 1 FROM unidades WHERE empreendimentoId = ? AND TRIM(numero) = TRIM(?) AND id <> ?'
  ).get([atual.empreendimentoId, num, unidadeId]);

  if (conflito) throw new Error(`Já existe outra unidade ${num} neste empreendimento.`);

  const st = STATUS_VALIDOS.includes(status) ? status : atual.status;

  // Voltar a unidade para "livre" desfaz o vínculo com o cliente
  const clienteId = st === 'livre' ? null : atual.clienteId;

  db.prepare(
    'UPDATE unidades SET numero = ?, pavimento = ?, tipologia = ?, metragem = ?, status = ?, clienteId = ? WHERE id = ?'
  ).run([num, pavimento || null, tipologia || null, metragem || null, st, clienteId, unidadeId]);
}

function impacto(id) {
  const unidadeId = parseInt(id);
  return {
    contratos: db.prepare('SELECT COUNT(*) n FROM contratos WHERE unidadeId = ?').get(unidadeId).n,
    documentos: db.prepare('SELECT COUNT(*) n FROM documentos WHERE unidadeId = ?').get(unidadeId).n,
    cliente: db.prepare('SELECT COUNT(*) n FROM clientes WHERE unidadeId = ?').get(unidadeId).n
  };
}

function excluir(id) {
  const unidadeId = parseInt(id);

  // Contrato e documento perdem a referência, mas continuam existindo:
  // apagar o histórico contratual junto com a unidade seria destrutivo demais.
  db.prepare('UPDATE contratos SET unidadeId = NULL WHERE unidadeId = ?').run(unidadeId);
  db.prepare('UPDATE documentos SET unidadeId = NULL WHERE unidadeId = ?').run(unidadeId);
  db.prepare('UPDATE clientes SET unidadeId = NULL WHERE unidadeId = ?').run(unidadeId);

  db.prepare('DELETE FROM unidades WHERE id = ?').run(unidadeId);
}

module.exports = { criar, criarEmLote, atualizar, impacto, excluir, STATUS_VALIDOS };
