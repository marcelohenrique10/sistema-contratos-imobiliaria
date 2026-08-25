const db = require('../database');
const { parsearData, adicionarMeses, formatarData } = require('./documento');

/**
 * Converte "R$ 10.000,00" em 10000. Aceita também "10000" e "10.000".
 * Retorna null quando não há número reconhecível.
 */
function parsearValor(texto) {
  const limpo = String(texto ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return null;

  // Formato brasileiro: ponto separa milhar, vírgula separa decimal
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo.replace(/\.(?=\d{3}(\D|$))/g, '');

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Expande as parcelas do contrato num cronograma de recebíveis.
 * Uma parcela "Mensais x8" vira 8 lançamentos, um por mês.
 */
function montarCronograma(compraVenda) {
  const lancamentos = [];

  (compraVenda.parcelas || []).forEach((parcela) => {
    if (!parcela.tipo) return;

    const valor = parsearValor(parcela.valorUnitario);
    if (valor === null) return;

    const quantidade = parseInt(String(parcela.quantidade || '1').replace(/\D/g, ''), 10) || 1;
    const inicio = parsearData(parcela.vencimentoInicial);

    for (let i = 0; i < quantidade; i++) {
      const data = inicio ? adicionarMeses(inicio, i) : null;
      lancamentos.push({
        categoria: parcela.tipo,
        valor,
        data: data ? data.toISOString().slice(0, 10) : null,
        observacao: quantidade > 1
          ? `${parcela.tipo} ${i + 1}/${quantidade}${data ? ` — venc. ${formatarData(data)}` : ''}`
          : `${parcela.tipo}${data ? ` — venc. ${formatarData(data)}` : ''}`
      });
    }
  });

  return lancamentos;
}

/**
 * Grava o cronograma de um contrato. Regerar o mesmo contrato substitui os
 * lançamentos anteriores, em vez de somar em cima.
 */
function registrarRecebiveis({ contratoId, empreendimentoId, compraVenda }) {
  if (!contratoId || !compraVenda) return { lancamentos: 0, total: 0 };

  const cronograma = montarCronograma(compraVenda);
  if (!cronograma.length) return { lancamentos: 0, total: 0 };

  db.prepare('DELETE FROM financeiro WHERE contratoId = ?').run(contratoId);

  const ins = db.prepare(
    'INSERT INTO financeiro (empreendimentoId, categoria, tipo, valor, data, observacao, status, contratoId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  cronograma.forEach((l) => {
    ins.run([empreendimentoId || null, l.categoria, 'entrada', l.valor, l.data, l.observacao, 'previsto', contratoId]);
  });

  return {
    lancamentos: cronograma.length,
    total: cronograma.reduce((acc, l) => acc + l.valor, 0)
  };
}

module.exports = { registrarRecebiveis, montarCronograma, parsearValor };
