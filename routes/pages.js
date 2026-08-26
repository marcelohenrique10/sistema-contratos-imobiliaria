const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { getResumoUnidades } = require('../data/helpers');
const exclusao = require('../services/exclusao');
const unidades = require('../services/unidades');
const financeiro = require('../services/financeiro');
const upload = require('../services/upload');
const retroativo = require('../services/retroativo');

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

// O cadastro antigo gravava '#' quando o link não era informado, e '#' é
// verdadeiro em JavaScript — por isso o botão aparecia habilitado e não levava
// a lugar nenhum. Aqui '#' e vazio viram ausência de link.
function normalizarLink(valor) {
  const texto = String(valor || '').trim();
  if (!texto || texto === '#') return null;

  // Só aceita endereço navegável; evita javascript: e afins no href
  if (!/^https?:\/\//i.test(texto)) {
    return /^[\w.-]+\.[a-z]{2,}/i.test(texto) ? `https://${texto}` : null;
  }
  return texto;
}

function comLinksNormalizados(empreendimento) {
  return {
    ...empreendimento,
    memorialLink: normalizarLink(empreendimento.memorialLink),
    plantaLink: normalizarLink(empreendimento.plantaLink),
    tabelaVendaLink: normalizarLink(empreendimento.tabelaVendaLink)
  };
}

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

  res.render('documentos', { documentos, enviado: Boolean(req.query.enviado) });
});

router.get('/', (req, res) => {
  const totalEmpreendimentos = db.prepare('SELECT COUNT(*) as n FROM empreendimentos').get().n;
  const totalClientes = db.prepare('SELECT COUNT(*) as n FROM clientes').get().n;
  const totalContratos = db.prepare('SELECT COUNT(*) as n FROM contratos').get().n;
  const lancamentos = db.prepare('SELECT tipo, valor, status, data FROM financeiro')
    .all()
    .map(financeiro.enriquecer);

  const t = financeiro.totais(lancamentos);

  res.render('index', {
    totalEmpreendimentos,
    totalClientes,
    totalContratos,
    totalEntradas: t.recebido,
    totalSaidas: t.saidas,
    totalPrevisto: t.aVencer,
    totalAtrasado: t.atrasado,
    saldo: t.saldo
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
    (memorialLink || '').trim() || null,
    (plantaLink || '').trim() || null,
    (tabelaVendaLink || '').trim() || null,
    razaoSocial || null, cnpj || null, socioAdmin || null, email || null, cep || null
  ]);

  criarEstruturaDocumentos(id);

  res.redirect('/empreendimentos');
});

router.get('/empreendimentos/:id/editar', (req, res) => {
  const empreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(req.params.id);
  if (!empreendimento) return res.status(404).send('Empreendimento não encontrado');

  res.render('empreendimento-editar', {
    // Aqui mostramos o valor cru, para o '#' herdado não virar link falso
    empreendimento: {
      ...empreendimento,
      memorialLink: empreendimento.memorialLink === '#' ? '' : (empreendimento.memorialLink || ''),
      plantaLink: empreendimento.plantaLink === '#' ? '' : (empreendimento.plantaLink || ''),
      tabelaVendaLink: empreendimento.tabelaVendaLink === '#' ? '' : (empreendimento.tabelaVendaLink || '')
    },
    erro: req.query.erro || null
  });
});

router.post('/empreendimentos/:id', (req, res) => {
  const {
    nome, endereco, status, descricao, memorialLink, plantaLink, tabelaVendaLink,
    razaoSocial, cnpj, socioAdmin, email, cep
  } = req.body;

  if (!(nome || '').trim()) {
    return res.redirect(`/empreendimentos/${req.params.id}/editar?erro=${encodeURIComponent('Informe o nome do empreendimento.')}`);
  }

  db.prepare(`
    UPDATE empreendimentos
    SET nome = ?, endereco = ?, status = ?, descricao = ?,
        memorialLink = ?, plantaLink = ?, tabelaVendaLink = ?,
        razaoSocial = ?, cnpj = ?, socioAdmin = ?, email = ?, cep = ?
    WHERE id = ?
  `).run([
    nome, endereco || null, status || 'ativo', descricao || null,
    (memorialLink || '').trim() || null,
    (plantaLink || '').trim() || null,
    (tabelaVendaLink || '').trim() || null,
    razaoSocial || null, cnpj || null, socioAdmin || null, email || null, cep || null,
    req.params.id
  ]);

  res.redirect(`/empreendimentos/${req.params.id}?ok=1`);
});

router.get('/empreendimentos/:id/excluir', (req, res) => {
  const empreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(req.params.id);
  if (!empreendimento) return res.status(404).send('Empreendimento não encontrado');

  res.render('empreendimento-excluir', {
    empreendimento,
    impacto: exclusao.impactoEmpreendimento(empreendimento.id)
  });
});

router.post('/empreendimentos/:id/excluir', (req, res) => {
  exclusao.excluirEmpreendimento(req.params.id);
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
      ...comLinksNormalizados(empreendimento),
      statusLabel: empreendimentoStatusMap[empreendimento.status] || empreendimento.status
    },
    unidades: unidadesDoEmpreendimento,
    resumo,
    statusMap: unidadeStatusMap,
    erro: req.query.erro || null,
    aviso: req.query.aviso || null,
    sucesso: Boolean(req.query.ok)
  });
});

// ---------- Unidades ----------

function voltarParaEmpreendimento(res, id, erro) {
  const sufixo = erro ? `?erro=${encodeURIComponent(erro)}` : '?ok=1';
  res.redirect(`/empreendimentos/${id}${sufixo}`);
}

router.post('/empreendimentos/:id/unidades', (req, res) => {
  try {
    unidades.criar({ empreendimentoId: req.params.id, ...req.body });
    voltarParaEmpreendimento(res, req.params.id);
  } catch (err) {
    voltarParaEmpreendimento(res, req.params.id, err.message);
  }
});

router.post('/empreendimentos/:id/unidades/lote', (req, res) => {
  try {
    const { criadas, puladas } = unidades.criarEmLote({ empreendimentoId: req.params.id, ...req.body });

    if (criadas === 0) {
      return voltarParaEmpreendimento(res, req.params.id,
        `Nenhuma unidade criada — todas já existiam (${puladas.join(', ')}).`);
    }

    const aviso = puladas.length
      ? `${criadas} unidades criadas. ${puladas.length} já existiam e foram mantidas.`
      : null;

    res.redirect(`/empreendimentos/${req.params.id}?ok=1${aviso ? `&aviso=${encodeURIComponent(aviso)}` : ''}`);
  } catch (err) {
    voltarParaEmpreendimento(res, req.params.id, err.message);
  }
});

router.get('/unidades/:id/editar', (req, res) => {
  const unidade = db.prepare('SELECT * FROM unidades WHERE id = ?').get(parseInt(req.params.id));
  if (!unidade) return res.status(404).send('Unidade não encontrada');

  const empreendimento = db.prepare('SELECT * FROM empreendimentos WHERE id = ?').get(unidade.empreendimentoId);

  res.render('unidade-editar', {
    unidade,
    empreendimento,
    statusMap: unidadeStatusMap,
    erro: req.query.erro || null
  });
});

router.post('/unidades/:id', (req, res) => {
  try {
    unidades.atualizar(req.params.id, req.body);
    const u = db.prepare('SELECT empreendimentoId FROM unidades WHERE id = ?').get(parseInt(req.params.id));
    res.redirect(`/empreendimentos/${u.empreendimentoId}?ok=1`);
  } catch (err) {
    res.redirect(`/unidades/${req.params.id}/editar?erro=${encodeURIComponent(err.message)}`);
  }
});

router.post('/unidades/:id/excluir', (req, res) => {
  const u = db.prepare('SELECT empreendimentoId FROM unidades WHERE id = ?').get(parseInt(req.params.id));
  unidades.excluir(req.params.id);
  res.redirect(`/empreendimentos/${u ? u.empreendimentoId : ''}?ok=1`);
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

router.get('/clientes/:id/editar', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(parseInt(req.params.id));
  if (!cliente) return res.status(404).send('Cliente não encontrado');

  res.render('cliente-editar', { cliente, erro: req.query.erro || null });
});

router.post('/clientes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { nome, cpfCnpj, telefone, email, tipo, observacoes } = req.body;

  if (!(nome || '').trim()) {
    return res.redirect(`/clientes/${id}/editar?erro=${encodeURIComponent('Informe o nome do cliente.')}`);
  }

  const documento = (cpfCnpj || '').trim();
  const conflito = documento
    ? db.prepare('SELECT nome FROM clientes WHERE cpfCnpj = ? AND id <> ?').get([documento, id])
    : null;

  if (conflito) {
    return res.redirect(
      `/clientes/${id}/editar?erro=${encodeURIComponent(`Outro cliente já usa esse CPF/CNPJ: ${conflito.nome}`)}`
    );
  }

  db.prepare(
    'UPDATE clientes SET nome = ?, cpfCnpj = ?, telefone = ?, email = ?, tipo = ?, observacoes = ? WHERE id = ?'
  ).run([nome, documento || null, telefone || null, email || null, tipo || 'Comprador', observacoes || null, id]);

  res.redirect('/clientes');
});

// Mostra o que será removido junto, antes de confirmar
router.get('/clientes/:id/excluir', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(parseInt(req.params.id));
  if (!cliente) return res.status(404).send('Cliente não encontrado');

  res.render('cliente-excluir', { cliente, impacto: exclusao.impactoCliente(cliente.id) });
});

router.post('/clientes/:id/excluir', (req, res) => {
  exclusao.excluirCliente(req.params.id);
  res.redirect('/clientes');
});

router.post('/contratos/:id/excluir', (req, res) => {
  exclusao.excluirContrato(req.params.id);
  res.redirect('/contratos');
});

// ---------- Envio de documento existente ----------

function dadosDoFormularioDeEnvio(req) {
  return {
    clientes: db.prepare('SELECT id, nome, cpfCnpj FROM clientes ORDER BY nome').all(),
    empreendimentos: db.prepare('SELECT id, nome FROM empreendimentos ORDER BY nome').all(),
    unidades: db.prepare('SELECT id, numero, empreendimentoId, status FROM unidades ORDER BY empreendimentoId, numero').all(),
    tipos: upload.TIPOS_DOCUMENTO,
    extensoes: upload.EXTENSOES,
    tamanhoMaximoMb: Math.round(upload.TAMANHO_MAXIMO / (1024 * 1024)),
    clientePreSelecionado: req.query.cliente || '',
    contratoPreSelecionado: req.query.contrato || '',
    // Contratos aguardando documento, por cliente — o upload pode satisfazê-los
    pendentesPorCliente: db.prepare(`
      SELECT id, nome, clienteId FROM contratos
      WHERE status IN ('pendente', 'em_preenchimento')
      ORDER BY created_at
    `).all(),
    erro: req.query.erro || null
  };
}

router.get('/documentos/enviar', (req, res) => {
  res.render('documento-enviar', dadosDoFormularioDeEnvio(req));
});

router.post('/documentos/enviar', (req, res) => {
  upload.receber(req, res, (erroUpload) => {
    if (erroUpload) {
      const msg = erroUpload.code === 'LIMIT_FILE_SIZE'
        ? `Arquivo maior que ${Math.round(upload.TAMANHO_MAXIMO / (1024 * 1024))} MB.`
        : erroUpload.message;
      return res.redirect(`/documentos/enviar?erro=${encodeURIComponent(msg)}`);
    }

    if (!req.file) {
      return res.redirect(`/documentos/enviar?erro=${encodeURIComponent('Escolha um arquivo.')}`);
    }

    try {
      if (!req.body.tipo) throw new Error('Escolha o tipo do documento.');

      const vinculos = upload.resolverVinculos(req.body);
      const r = upload.registrar({
        vinculos,
        tipo: req.body.tipo,
        arquivo: req.file,
        contratoId: req.body.contratoId
      });

      // Se atendeu um contrato que estava aguardando, leva de volta para lá
      res.redirect(r.contratoAtendido ? '/contratos?anexado=1' : '/documentos?enviado=1');
    } catch (err) {
      // Falhou depois de gravar o arquivo: remove para não deixar órfão
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      res.redirect(`/documentos/enviar?erro=${encodeURIComponent(err.message)}`);
    }
  });
});

router.post('/documentos/:id/excluir', (req, res) => {
  exclusao.excluirDocumento(req.params.id);
  res.redirect('/documentos');
});

router.get('/contratos', (req, res) => {
  const empreendimentos = db.prepare('SELECT * FROM empreendimentos').all();
  const clientes = db.prepare('SELECT * FROM clientes').all();
  const unidades = db.prepare('SELECT * FROM unidades').all();

  // Cada situação diz o que está acontecendo e qual é o próximo passo.
  const situacoes = {
    pendente: {
      rotulo: 'Aguardando',
      explica: 'Esperando o formulário ser preenchido, ou o documento assinado ser enviado.',
      cor: 'amarelo'
    },
    em_preenchimento: {
      rotulo: 'Em preenchimento',
      explica: 'O formulário chegou e o documento está sendo montado.',
      cor: 'azul'
    },
    gerado: {
      rotulo: 'Gerado',
      explica: 'Documento pronto, criado pelo sistema.',
      cor: 'verde'
    },
    anexado: {
      rotulo: 'Anexado',
      explica: 'Documento enviado pela equipe, não gerado pelo sistema.',
      cor: 'verde'
    },
    disponivel: { rotulo: 'Disponível', explica: '', cor: 'cinza' }
  };

  // Documentos de verdade, para a operação parar de mentir sobre o que mostra
  const documentosPorContrato = {};
  db.prepare(`
    SELECT id, contratoId, caminho, origem, nome, data
    FROM documentos WHERE contratoId IS NOT NULL
  `).all().forEach((d) => {
    const relativo = String(d.caminho || '').replace(/^\/storage\//, '');
    documentosPorContrato[d.contratoId] = {
      ...d,
      disponivel: Boolean(relativo) && fs.existsSync(path.join(__dirname, '..', 'storage', relativo))
    };
  });

  const contratosEnriquecidos = db.prepare(`
    SELECT ct.*,
      cl.nome as clienteNome,
      e.nome as empreendimentoNome,
      u.numero as unidadeNumero
    FROM contratos ct
    LEFT JOIN clientes cl ON ct.clienteId = cl.id
    LEFT JOIN empreendimentos e ON ct.empreendimentoId = e.id
    LEFT JOIN unidades u ON ct.unidadeId = u.id
  `).all().map((c) => {
    const s = situacoes[c.status] || { rotulo: c.status, explica: '', cor: 'cinza' };
    return {
      ...c,
      statusLabel: s.rotulo,
      statusExplica: s.explica,
      statusCor: s.cor,
      documento: documentosPorContrato[c.id] || null
    };
  });

  const operacoesMap = {};
  contratosEnriquecidos.forEach((c) => {
    const key = `${c.clienteId}-${c.unidadeId}`;
    if (!operacoesMap[key]) {
      operacoesMap[key] = {
        operacaoId: key,
        clienteId: c.clienteId,
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

  const prontos = (c) => ['gerado', 'anexado'].includes(c.status);

  const operacoes = Object.values(operacoesMap).map((op) => {
    const concluidos = op.contratos.filter(prontos).length;
    const aguardando = op.contratos.filter((c) => c.status === 'pendente').length;

    return {
      ...op,
      concluidos,
      total: op.contratos.length,
      aguardando,
      statusGeral: concluidos === op.contratos.length ? 'Concluído' : 'Em andamento'
    };
  });

  res.render('contratos', {
    operacoes, clientes, empreendimentos, unidades,
    anexado: Boolean(req.query.anexado),
    aproveitados: parseInt(req.query.aproveitados) || 0,
    formLink: 'https://docs.google.com/forms/d/e/1FAIpQLSeqABI1z4kCqJUjv9gK3hc45BldUVBJcCjNiT13FyY2tF_V5Q/viewform'
  });
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

  const criados = templates.map((template, i) => {
    const id = `${operacaoId}-${i}`;
    ins.run([
      id,
      template.nome,
      template.categoria,
      'pendente',
      FORM_LINK,
      empreendimentoId,
      unidadeId ? parseInt(unidadeId) : null,
      parseInt(clienteId)
    ]);
    return { id, nome: template.nome };
  });

  // O formulário pode ter chegado antes desta operação existir. Se o documento
  // já está pronto, o pendente adota em vez de ficar esperando à toa.
  const aproveitados = retroativo.aproveitarDocumentosExistentes({
    clienteId,
    contratos: criados
  });

  if (unidadeId) {
    db.prepare('UPDATE unidades SET status = ?, clienteId = ? WHERE id = ?').run([
      'negociacao',
      parseInt(clienteId),
      parseInt(unidadeId)
    ]);
  }

  const qs = aproveitados.length ? `?aproveitados=${aproveitados.length}` : '';
  res.redirect(`/contratos${qs}`);
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

  const lancamentos = financeiroComRelacionamento
    .map(financeiro.enriquecer)
    .map((item) => ({ ...item, tipoLabel: financeiroTipoMap[item.tipo] || item.tipo }))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

  const filtro = req.query.situacao;
  const visiveis = ['previsto', 'atrasado', 'recebido'].includes(filtro)
    ? lancamentos.filter((l) => l.situacao === filtro)
    : lancamentos;

  res.render('financeiro', {
    financeiro: visiveis,
    totais: financeiro.totais(lancamentos),
    contagem: {
      previsto: lancamentos.filter((l) => l.situacao === 'previsto').length,
      atrasado: lancamentos.filter((l) => l.situacao === 'atrasado').length,
      recebido: lancamentos.filter((l) => l.situacao === 'recebido').length
    },
    empreendimentos,
    empreendimentoSelecionado: empreendimentoId,
    situacaoSelecionada: filtro || 'todas',
    erro: req.query.erro || null
  });
});

// ---------- Ações do financeiro ----------

function voltarParaFinanceiro(req, res, erro) {
  const qs = new URLSearchParams();
  if (req.body.empreendimento || req.query.empreendimento) {
    qs.set('empreendimento', req.body.empreendimento || req.query.empreendimento);
  }
  if (erro) qs.set('erro', erro);
  res.redirect(`/financeiro${qs.toString() ? `?${qs}` : ''}`);
}

router.post('/financeiro/:id/receber', (req, res) => {
  financeiro.confirmarRecebimento(req.params.id, req.body.dataRecebimento);
  voltarParaFinanceiro(req, res);
});

router.post('/financeiro/:id/desfazer', (req, res) => {
  financeiro.desfazerRecebimento(req.params.id);
  voltarParaFinanceiro(req, res);
});

router.post('/financeiro', (req, res) => {
  try {
    financeiro.criar(req.body);
    voltarParaFinanceiro(req, res);
  } catch (err) {
    voltarParaFinanceiro(req, res, err.message);
  }
});

router.post('/financeiro/:id', (req, res) => {
  try {
    financeiro.atualizar(req.params.id, req.body);
    voltarParaFinanceiro(req, res);
  } catch (err) {
    voltarParaFinanceiro(req, res, err.message);
  }
});

router.post('/financeiro/:id/excluir', (req, res) => {
  financeiro.excluir(req.params.id);
  voltarParaFinanceiro(req, res);
});

module.exports = router;
