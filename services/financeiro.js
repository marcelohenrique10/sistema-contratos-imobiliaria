const db = require('../database');

const CATEGORIAS_SAIDA = ['Obra', 'Projeto', 'Fornecedor', 'Imposto', 'Outros'];

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

// Dinheiro que entra é recebido; dinheiro que sai é pago. Guardamos um
// status só ('recebido'), mas quem lê a tela precisa da palavra certa.
const ROTULOS = {
  entrada: { previsto: 'A vencer', atrasado: 'Atrasado', recebido: 'Recebido' },
  saida:   { previsto: 'A pagar',  atrasado: 'Atrasado', recebido: 'Pago' }
};

function rotulo(sit, tipo) {
  return (ROTULOS[tipo] || ROTULOS.entrada)[sit];
}

function enriquecer(lancamento) {
  const sit = situacao(lancamento);
  return { ...lancamento, situacao: sit, situacaoLabel: rotulo(sit, lancamento.tipo) };
}

/** Confirma que o dinheiro entrou. Só o sistema não sabe disso sozinho. */
function confirmarRecebimento(id, dataRecebimento) {
  db.prepare('UPDATE financeiro SET status = ?, dataRecebimento = ? WHERE id = ?')
    .run(['recebido', dataRecebimento || hoje(), parseInt(id)]);
}

/** Desfaz a confirmação — alguém vai clicar no lançamento errado. */
function desfazerRecebimento(id) {
  db.prepare('UPDATE financeiro SET status = ?, dataRecebimento = NULL WHERE id = ?')
    .run(['previsto', parseInt(id)]);
}

function criar({ empreendimentoId, categoria, tipo, valor, data, observacao, status }) {
  const numero = Number(String(valor).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }
  if (!['entrada', 'saida'].includes(tipo)) {
    throw new Error('Escolha se é entrada ou saída.');
  }

  const st = status === 'previsto' ? 'previsto' : 'recebido';

  db.prepare(
    'INSERT INTO financeiro (empreendimentoId, categoria, tipo, valor, data, observacao, status, dataRecebimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run([
    empreendimentoId || null, categoria || 'Outros', tipo, numero,
    data || hoje(), observacao || null, st, st === 'recebido' ? (data || hoje()) : null
  ]);
}

function atualizar(id, { categoria, tipo, valor, data, observacao }) {
  const numero = Number(String(valor).replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error('Informe um valor maior que zero.');
  }
  if (!['entrada', 'saida'].includes(tipo)) {
    throw new Error('Escolha se é entrada ou saída.');
  }

  db.prepare(
    'UPDATE financeiro SET categoria = ?, tipo = ?, valor = ?, data = ?, observacao = ? WHERE id = ?'
  ).run([categoria || 'Outros', tipo, numero, data || null, observacao || null, parseInt(id)]);
}

function excluir(id) {
  db.prepare('DELETE FROM financeiro WHERE id = ?').run(parseInt(id));
}

/**
 * Totais do painel. Só o que foi confirmado entra no saldo — previsto e
 * atrasado ficam de fora, senão o caixa mostraria dinheiro que não chegou.
 */
function totais(lancamentos) {
  const soma = (filtro) => lancamentos.filter(filtro).reduce((acc, l) => acc + l.valor, 0);

  const recebido = soma((l) => l.tipo === 'entrada' && l.situacao === 'recebido');
  const saidas = soma((l) => l.tipo === 'saida' && l.situacao === 'recebido');

  return {
    recebido,
    saidas,
    aVencer: soma((l) => l.tipo === 'entrada' && l.situacao === 'previsto'),
    atrasado: soma((l) => l.tipo === 'entrada' && l.situacao === 'atrasado'),
    saldo: recebido - saidas
  };
}

module.exports = {
  enriquecer, situacao, rotulo, confirmarRecebimento, desfazerRecebimento,
  criar, atualizar, excluir, totais, CATEGORIAS_SAIDA, hoje
};
