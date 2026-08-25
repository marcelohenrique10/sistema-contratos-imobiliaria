const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { getResumoUnidades } = require('../data/helpers');

function criarEstruturaDocumentos(empreendimentoId) {
  const basePath = path.join(__dirname, '..', 'storage', 'documentos', empreendimentoId);

  const pastas = [
    basePath,
    path.join(basePath, 'contratos'),
    path.join(basePath, 'anexos'),
    path.join(basePath, 'termos')
  ];

  pastas.forEach((pasta) => {
    if (!fs.existsSync(pasta)) {
      fs.mkdirSync(pasta, { recursive: true });
    }
  });
}

const empreendimentoStatusMap = {
  ativo: 'Ativo',
  em_planejamento: 'Em planejamento',
  concluido: 'Concluído'
};

const unidadeStatusMap = {
  livre: 'Livre',
  negociacao: 'Negociação',
  vendido: 'Vendido',
  permutado: 'Permutado',
  cancelado: 'Cancelado'
};

const financeiroTipoMap = {
  entrada: 'Entrada',
  saida: 'Saída'
};

router.get('/documentos', (req, res) => {
  const documentos = db.prepare(`
    SELECT d.*,
      COALESCE(e.nome, '-') as empreendimentoNome,
      COALESCE(u.numero, '-') as unidadeNumero,
      COALESCE(c.nome, '-') as clienteNome
    FROM documentos d
    LEFT JOIN empreendimentos e ON d.empreendimentoId = e.id
    LEFT JOIN unidades u ON d.unidadeId = u.id
    LEFT JOIN clientes c ON d.clienteId = c.id
  `).all().map((doc) => {
    // Os registros de exemplo apontam para arquivos que nunca existiram.
    // Só oferece download do que estiver mesmo no disco.
    const relativo = String(doc.caminho || '').replace(/^\/storage\//, '');
    const disponivel = Boolean(relativo) && fs.existsSync(path.join(__dirname, '..', 'storage', relativo));

    return { ...doc, disponivel };
  });

  res.render('documentos', { documentos });
});

router.get('/', (req, res) => {
  const totalEmpreendimentos = db.prepare('SELECT COUNT(*) as n FROM empreendimentos').get().n;
  const totalClientes = db.prepare('SELECT COUNT(*) as n FROM clientes').get().n;
  const totalContratos = db.prepare('SELECT COUNT(*) as n FROM contratos').get().n;
  const financeiro = db.prepare('SELECT tipo, valor, status FROM financeiro').all();

  const somar = (filtro) => financeiro.filter(filtro).reduce((acc, f) => acc + f.valor, 0);
  const previsto = (f) => f.status === 'previsto';

  // "Entradas" é o que já entrou; o previsto vem das parcelas ainda a vencer.
  const totalEntradas = somar((f) => f.tipo === 'entrada' && !previsto(f));
  const totalSaidas = somar((f) => f.tipo === 'saida' && !previsto(f));
  const totalPrevisto = somar((f) => f.tipo === 'entrada' && previsto(f));

  res.render('index', {
    totalEmpreendimentos,
    totalClientes,
    totalContratos,
    totalEntradas,
    totalSaidas,
    totalPrevisto
  });
});

router.get('/empreendimentos', (req, res) => {
  const empreendimentos = db.prepare('SELECT * FROM empreendimentos').all();

  const empreendimentosComResumo = empreendimentos.map((empreendimento) => {
    const unidadesDoEmpreendimento = db.prepare(
      'SELECT * FROM unidades WHERE empreendimentoId = ?'
    ).all(empreendimento.id);

    return {
      ...empreendimento,
      statusLabel: empreendimentoStatusMap[empreendimento.status] || empreendimento.status,
      resumo: getResumoUnidades(unidadesDoEmpreendimento)
    };
  });

  res.render('empreendimentos', { empreendimentos: empreendimentosComResumo });
});

router.post('/empreendimentos', (req, res) => {
  const {
    nome, endereco, status, descricao, memorialLink, plantaLink, tabelaVendaLink,
    razaoSocial, cnpj, socioAdmin, email, cep
  } = req.body;

  const id = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-');

  db.prepare(
    'INSERT INTO empreendimentos (id, nome, endereco, status, descricao, memorialLink, plantaLink, tabelaVendaLink, razaoSocial, cnpj, socioAdmin, email, cep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run([
    id, nome, endereco, status, descricao,
    memorialLink || '#', plantaLink || '#', tabelaVendaLink || '#',
    razaoSocial || null, cnpj || null, socioAdmin || null, email || null, cep || null
  ]);

  criarEstruturaDocumentos(id);

  res.redirect('/empreendimentos');
});

router.post('/empreendimentos/:id/delete', (req, res) => {
  db.prepare('DELETE FROM empreendimentos WHERE id = ?').run(req.params.id);
  res.redirect('/empreendimentos');
});

router.get('/empreendimentos/:id', (req, res) => {
  const empreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(req.params.id);

  if (!empreendimento) {
    return res.status(404).send('Empreendimento não encontrado');
  }

  const unidadesDoEmpreendimento = db.prepare(
    'SELECT * FROM unidades WHERE empreendimentoId = ?'
  ).all(empreendimento.id).map((u) => ({
    ...u,
    statusLabel: unidadeStatusMap[u.status] || u.status
  }));

  const resumo = getResumoUnidades(unidadesDoEmpreendimento);

  res.render('empreendimento-detalhe', {
    empreendimento: {
      ...empreendimento,
      statusLabel: empreendimentoStatusMap[empreendimento.status] || empreendimento.status
    },
    unidades: unidadesDoEmpreendimento,
    resumo
  });
});

router.get('/espelho', (req, res) => {
  const empreendimentos = db.prepare('SELECT * FROM empreendimentos').all();
  const empreendimentoId = req.query.empreendimento || empreendimentos[0]?.id;

  const empreendimentoSelecionado = empreendimentos.find(e => e.id === empreendimentoId);

  const unidades = db.prepare(`
    SELECT u.*, c.nome as clienteNome
    FROM unidades u
    LEFT JOIN clientes c ON u.clienteId = c.id
    WHERE u.empreendimentoId = ?
  `).all(empreendimentoId).map((u) => ({
    ...u,
    statusLabel: unidadeStatusMap[u.status] || u.status
  }));

  res.render('espelho', {
    empreendimentos,
    empreendimentoSelecionado,
    unidades
  });
});

router.get('/clientes', (req, res) => {
  const clientes = db.prepare(`
    SELECT cl.*,
      COALESCE(e.nome, 'Não vinculado') as empreendimentoNome,
      COALESCE(u.numero, 'Não vinculada') as unidadeNumero
    FROM clientes cl
    LEFT JOIN empreendimentos e ON cl.empreendimentoId = e.id
    LEFT JOIN unidades u ON cl.unidadeId = u.id
  `).all();

  res.render('clientes', { clientes, erro: req.query.erro || null });
});

// Cadastro manual: a outra porta de entrada de cliente, além do formulário.
// O CPF/CNPJ é a chave que liga esse cadastro à resposta do formulário depois.
router.post('/clientes', (req, res) => {
  const { nome, cpfCnpj, telefone, email, tipo, observacoes } = req.body;

  if (!(nome || '').trim()) {
    return res.redirect(`/clientes?erro=${encodeURIComponent('Informe o nome do cliente.')}`);
  }

  const documento = (cpfCnpj || '').trim();
  const jaExiste = documento
    ? db.prepare('SELECT nome FROM clientes WHERE cpfCnpj = ?').get(documento)
    : null;

  if (jaExiste) {
    return res.redirect(
      `/clientes?erro=${encodeURIComponent(`Já existe um cliente com esse CPF/CNPJ: ${jaExiste.nome}`)}`
    );
  }

  db.prepare(
    'INSERT INTO clientes (nome, cpfCnpj, telefone, email, tipo, observacoes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run([nome, documento || null, telefone || null, email || null, tipo || 'Comprador', observacoes || null]);

  res.redirect('/clientes');
});

router.get('/contratos', (req, res) => {
  const empreendimentos = db.prepare('SELECT * FROM empreendimentos').all();
  const clientes = db.prepare('SELECT * FROM clientes').all();
  const unidades = db.prepare('SELECT * FROM unidades').all();

  const statusMap = {
    disponivel: 'Disponível',
    em_preenchimento: 'Em preenchimento',
    gerado: 'Gerado',
    pendente: 'Pendente'
  };

  const contratosEnriquecidos = db.prepare(`
    SELECT ct.*,
      cl.nome as clienteNome,
      e.nome as empreendimentoNome,
      u.numero as unidadeNumero
    FROM contratos ct
    LEFT JOIN clientes cl ON ct.clienteId = cl.id
    LEFT JOIN empreendimentos e ON ct.empreendimentoId = e.id
    LEFT JOIN unidades u ON ct.unidadeId = u.id
  `).all().map((c) => ({
    ...c,
    statusLabel: statusMap[c.status] || c.status
  }));

  const operacoesMap = {};
  contratosEnriquecidos.forEach((c) => {
    const key = `${c.clienteId}-${c.unidadeId}`;
    if (!operacoesMap[key]) {
      operacoesMap[key] = {
        operacaoId: key,
        clienteNome: c.clienteNome,
        unidadeNumero: c.unidadeNumero,
        empreendimentoNome: c.empreendimentoNome,
        dataInicio: c.created_at ? c.created_at.split('T')[0] : '-',
        categoriaOperacao: c.categoria,
        contratos: []
      };
    }
    operacoesMap[key].contratos.push(c);
  });

  const operacoes = Object.values(operacoesMap).map((op) => ({
    ...op,
    statusGeral: op.contratos.every((c) => c.status === 'gerado') ? 'Concluído' : 'Em andamento'
  }));

  res.render('contratos', { operacoes, clientes, empreendimentos, unidades });
});

router.post('/contratos/iniciar', (req, res) => {
  const { clienteId, empreendimentoId, unidadeId, categoriaOperacao, observacoes } = req.body;

  const operacaoId = `op-${Date.now()}`;

  const templatesMap = {
    compra_venda: [
      { nome: 'Contrato de Promessa de Compra e Venda', categoria: 'Compra e Venda' },
      { nome: 'Anexo ao Contrato de Promessa de Compra e Venda', categoria: 'Anexo' },
      { nome: 'Termo de Anuência com Outorga de Poderes', categoria: 'Termo' }
    ],
    permuta: [
      { nome: 'Contrato de Permuta', categoria: 'Permuta' },
      { nome: 'Termo de Ciência e Anuência', categoria: 'Termo' }
    ],
    reserva: [
      { nome: 'Termo de Reserva', categoria: 'Reserva' }
    ]
  };

  const templates = templatesMap[categoriaOperacao] || [];
  const FORM_LINK = 'https://docs.google.com/forms/d/10F6hk-zWLtZkzk2Xhnn-X1Tu5q2UVh9WXmlBOfu_5EU/viewform';
  const ins = db.prepare(
    'INSERT INTO contratos (id, nome, categoria, status, formLink, empreendimentoId, unidadeId, clienteId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  templates.forEach((template, i) => {
    ins.run([
      `${operacaoId}-${i}`,
      template.nome,
      template.categoria,
      'pendente',
      FORM_LINK,
      empreendimentoId,
      unidadeId ? parseInt(unidadeId) : null,
      parseInt(clienteId)
    ]);
  });

  if (unidadeId) {
    db.prepare('UPDATE unidades SET status = ?, clienteId = ? WHERE id = ?').run([
      'negociacao',
      parseInt(clienteId),
      parseInt(unidadeId)
    ]);
  }

  res.redirect('/contratos');
});

router.get('/financeiro', (req, res) => {
  const empreendimentos = db.prepare('SELECT * FROM empreendimentos').all();
  const empreendimentoId = req.query.empreendimento || 'todos';

  let financeiroComRelacionamento;

  if (empreendimentoId !== 'todos') {
    financeiroComRelacionamento = db.prepare(`
      SELECT f.*, COALESCE(e.nome, 'Não vinculado') as empreendimentoNome
      FROM financeiro f
      LEFT JOIN empreendimentos e ON f.empreendimentoId = e.id
      WHERE f.empreendimentoId = ?
    `).all(empreendimentoId);
  } else {
    financeiroComRelacionamento = db.prepare(`
      SELECT f.*, COALESCE(e.nome, 'Não vinculado') as empreendimentoNome
      FROM financeiro f
      LEFT JOIN empreendimentos e ON f.empreendimentoId = e.id
    `).all();
  }

  financeiroComRelacionamento = financeiroComRelacionamento.map((item) => ({
    ...item,
    tipoLabel: financeiroTipoMap[item.tipo] || item.tipo
  }));

  const somar = (filtro) => financeiroComRelacionamento.filter(filtro).reduce((acc, i) => acc + i.valor, 0);
  const previsto = (i) => i.status === 'previsto';

  const totalEntradas = somar((i) => i.tipo === 'entrada' && !previsto(i));
  const totalSaidas = somar((i) => i.tipo === 'saida' && !previsto(i));
  const totalPrevisto = somar((i) => i.tipo === 'entrada' && previsto(i));

  const saldo = totalEntradas - totalSaidas;

  res.render('financeiro', {
    financeiro: financeiroComRelacionamento,
    empreendimentos,
    empreendimentoSelecionado: empreendimentoId,
    totalEntradas,
    totalSaidas,
    totalPrevisto,
    saldo
  });
});

module.exports = router;
