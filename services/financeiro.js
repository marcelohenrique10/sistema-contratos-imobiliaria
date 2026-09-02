const db = require('../database');

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atraso não é um estado guardado, é consequência da data: parcela ainda
 * prevista cujo vencimento já passou. Calculando, nunca desatualiza.
 */
function situacao(lancamento) {
  if (lancamento.status !== 'previsto') return 'recebido';
  if (!lancamento.data) return 'previsto';
  return lancamento.data < hoje() ? 'atrasado' : 'previsto';
}

const ROTULOS = {
  entrada: {
    previsto: 'A vencer',
    atrasado: 'Atrasado',
    recebido: 'Recebido'
  }
};

function rotulo(sit, tipo) {
  return (ROTULOS[tipo] || ROTULOS.entrada)[sit];
}

function enriquecer(lancamento) {
  const sit = situacao(lancamento);
  return {
    ...lancamento,
    situacao: sit,
    situacaoLabel: rotulo(sit, lancamento.tipo)
  };
}

/** Confirma que o dinheiro entrou. */
function confirmarRecebimento(id, dataRecebimento) {
  db.prepare('UPDATE financeiro SET status = ?, dataRecebimento = ? WHERE id = ?')
    .run(['recebido', dataRecebimento || hoje(), parseInt(id)]);
}

/** Desfaz a confirmação. */
function desfazerRecebimento(id) {
  db.prepare('UPDATE financeiro SET status = ?, dataRecebimento = NULL WHERE id = ?')
    .run(['previsto', parseInt(id)]);
}

function criar({ empreendimentoId, categoria, valor, data, observacao, status }) {
  const numero = Number(String(valor).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }

  const st = status === 'previsto' ? 'previsto' : 'recebido';
  
  // Forçamos o tipo sempre como 'entrada' para eliminar as saídas
  db.prepare(
    'INSERT INTO financeiro (empreendimentoId, categoria, tipo, valor, data, observacao, status, dataRecebimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run([
    empreendimentoId || null,
    categoria || 'Outros',
    'entrada',
    numero,
    data || hoje(),
    observacao || null,
    st,
    st === 'recebido' ? (data || hoje()) : null
  ]);
}

function atualizar(id, { categoria, valor, data, observacao }) {
  const numero = Number(String(valor).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }

  db.prepare(
    'UPDATE financeiro SET categoria = ?, tipo = ?, valor = ?, data = ?, observacao = ? WHERE id = ?'
  ).run([categoria || 'Outros', 'entrada', numero, data || null, observacao || null, parseInt(id)]);
}

function excluir(id) {
  db.prepare('DELETE FROM financeiro WHERE id = ?').run(parseInt(id));
}

/**
 * Totais focados exclusivamente em Entradas (Recebimentos)
 */
function totais(lancamentos) {
  const soma = (filtro) => lancamentos.filter(filtro).reduce((acc, l) => acc + l.valor, 0);

  const recebido = soma((l) => l.tipo === 'entrada' && l.situacao === 'recebido');

  return {
    recebido,
    saidas: 0, // Mantido em 0 para não quebrar a estrutura existente
    aVencer: soma((l) => l.tipo === 'entrada' && l.situacao === 'previsto'),
    atrasado: soma((l) => l.tipo === 'entrada' && l.situacao === 'atrasado'),
    saldo: recebido // Sem saídas, o saldo é o próprio recebido
  };
}

module.exports = {
  enriquecer,
  situacao,
  rotulo,
  confirmarRecebimento,
  desfazerRecebimento,
  criar,
  atualizar,
  excluir,
  totais,
  CATEGORIAS_SAIDA: [], // Zera as categorias de saída
  hoje
};