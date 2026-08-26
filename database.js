require('dotenv').config();
const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

// Remove stale lock left by a previous crashed process
const lockPath = path.join(__dirname, 'imobiliaria.db.lock');
try { fs.rmSync(lockPath, { recursive: true, force: true }); } catch (_) {}

const db = new Database(path.join(__dirname, 'imobiliaria.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS empreendimentos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    endereco TEXT,
    status TEXT DEFAULT 'ativo',
    descricao TEXT,
    memorialLink TEXT,
    plantaLink TEXT,
    tabelaVendaLink TEXT
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpfCnpj TEXT,
    telefone TEXT,
    email TEXT,
    tipo TEXT DEFAULT 'Comprador',
    observacoes TEXT,
    empreendimentoId TEXT,
    unidadeId INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS unidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimentoId TEXT,
    numero TEXT NOT NULL,
    pavimento TEXT,
    tipologia TEXT,
    metragem TEXT,
    status TEXT DEFAULT 'livre',
    clienteId INTEGER
  );

  CREATE TABLE IF NOT EXISTS contratos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    categoria TEXT,
    descricao TEXT,
    formLink TEXT DEFAULT '#',
    status TEXT DEFAULT 'disponivel',
    empreendimentoId TEXT,
    unidadeId INTEGER,
    clienteId INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financeiro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empreendimentoId TEXT,
    categoria TEXT,
    tipo TEXT,
    valor REAL,
    data TEXT,
    observacao TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT,
    nome TEXT,
    empreendimentoId TEXT,
    unidadeId INTEGER,
    clienteId INTEGER,
    caminho TEXT,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    payload TEXT,
    status TEXT DEFAULT 'recebido',
    erro TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Dados da SPE do empreendimento: cada um é uma sociedade própria, com CNPJ
// próprio, e aparece como VENDEDORA nos contratos. Adicionadas depois da
// criação original da tabela, por isso via ALTER.
const colunasEmpreendimento = db.prepare('PRAGMA table_info(empreendimentos)').all().map((c) => c.name);

[
  'razaoSocial',
  'cnpj',
  'socioAdmin',
  'email',
  'cep'
].forEach((coluna) => {
  if (!colunasEmpreendimento.includes(coluna)) {
    db.exec(`ALTER TABLE empreendimentos ADD COLUMN ${coluna} TEXT`);
  }
});

// Lançamentos gerados a partir das parcelas de um contrato nascem como
// "previsto" — o dinheiro ainda não entrou. contratoId permite regerar o
// cronograma sem duplicar.
const colunasFinanceiro = db.prepare('PRAGMA table_info(financeiro)').all().map((c) => c.name);

if (!colunasFinanceiro.includes('status')) {
  db.exec("ALTER TABLE financeiro ADD COLUMN status TEXT DEFAULT 'recebido'");
}
if (!colunasFinanceiro.includes('contratoId')) {
  db.exec('ALTER TABLE financeiro ADD COLUMN contratoId TEXT');
}
// Quando o recebimento foi confirmado. Guardar a data permite distinguir
// "recebeu no prazo" de "recebeu atrasado" depois.
if (!colunasFinanceiro.includes('dataRecebimento')) {
  db.exec('ALTER TABLE financeiro ADD COLUMN dataRecebimento TEXT');
}

// Identificador da resposta do formulário (o carimbo de data/hora, único por
// envio). Impede que reprocessar a mesma resposta crie contrato e documento
// duplicados — o n8n pode reexecutar por falha de rede ou clique repetido.
['contratos', 'documentos'].forEach((tabela) => {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas.includes('respostaId')) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN respostaId TEXT`);
  }
});

// Distingue o que o sistema gerou do que alguém enviou de fora.
const colunasDocumentos = db.prepare('PRAGMA table_info(documentos)').all().map((c) => c.name);
if (!colunasDocumentos.includes('origem')) {
  db.exec("ALTER TABLE documentos ADD COLUMN origem TEXT DEFAULT 'gerado'");
}
if (!colunasDocumentos.includes('nomeOriginal')) {
  db.exec('ALTER TABLE documentos ADD COLUMN nomeOriginal TEXT');
}
// Qual contrato este arquivo satisfaz. Sem isso, a tela de Contratos não tem
// como mostrar o documento de cada item da operação.
if (!colunasDocumentos.includes('contratoId')) {
  db.exec('ALTER TABLE documentos ADD COLUMN contratoId TEXT');
}
// Quais campos do modelo ficaram em branco neste documento, em JSON. Guardar
// permite responder a verdade quando a mesma resposta é reprocessada — sem
// isso o aviso sairia dizendo "nenhum campo em branco" sem ter conferido.
if (!colunasDocumentos.includes('camposSemValor')) {
  db.exec('ALTER TABLE documentos ADD COLUMN camposSemValor TEXT');
}

// Seed empreendimentos
if (db.prepare('SELECT COUNT(*) as n FROM empreendimentos').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO empreendimentos (id, nome, endereco, status, descricao, memorialLink, plantaLink, tabelaVendaLink) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  ins.run(['high-tower', 'High Tower Jardins', 'Aracruz/ES', 'ativo', 'Empreendimento residencial com unidades e lojas.', '#', '#', '#']);
  ins.run(['reserva-verde', 'Reserva Verde', 'Vitória/ES', 'em_planejamento', 'Empreendimento em fase inicial de estruturação.', '#', '#', '#']);
}

// Seed clientes
if (db.prepare('SELECT COUNT(*) as n FROM clientes').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO clientes (id, nome, cpfCnpj, telefone, email, tipo, observacoes, empreendimentoId, unidadeId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  ins.run([1, 'João Silva', '123.456.789-00', '(27) 99999-9999', 'joao@email.com', 'Comprador', '', 'high-tower', 2]);
  ins.run([2, 'Maria Souza', '987.654.321-00', '(27) 98888-8888', 'maria@email.com', 'Investidor', '', 'reserva-verde', null]);
}

// Seed unidades
if (db.prepare('SELECT COUNT(*) as n FROM unidades').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO unidades (id, empreendimentoId, numero, pavimento, tipologia, metragem, status, clienteId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  ins.run([1, 'high-tower', '1101', '11º', 'Cobertura Duplex', '177,73 m²', 'livre', null]);
  ins.run([2, 'high-tower', '1001', '10º', '3Q', '97,05 m²', 'vendido', 1]);
  ins.run([3, 'high-tower', '1002', '10º', '3Q', '93,89 m²', 'negociacao', null]);
  ins.run([4, 'high-tower', '901', '9º', '2Q', '82,10 m²', 'livre', null]);
  ins.run([5, 'high-tower', '902', '9º', '2Q', '80,25 m²', 'permutado', null]);
  ins.run([6, 'reserva-verde', '201', '2º', '2Q', '68,00 m²', 'livre', null]);
  ins.run([7, 'reserva-verde', '202', '2º', '2Q', '68,00 m²', 'negociacao', null]);
  ins.run([8, 'reserva-verde', '301', '3º', '3Q', '89,50 m²', 'livre', null]);
}

// Seed contratos
if (db.prepare('SELECT COUNT(*) as n FROM contratos').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO contratos (id, nome, categoria, descricao, formLink, status, empreendimentoId, unidadeId, clienteId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  ins.run(['promessa-compra-venda', 'Contrato de Promessa de Compra e Venda', 'Compra e venda', 'Contrato principal da venda da unidade.', '#', 'disponivel', 'high-tower', 2, 1]);
  ins.run(['anexo-compra-venda', 'Anexo ao Contrato de Promessa de Compra e Venda', 'Anexo', 'Declaração e termo de ciência.', '#', 'em_preenchimento', 'high-tower', 2, 1]);
  ins.run(['termo-outorga', 'Termo de Anuência com Outorga de Poderes', 'Termo', 'Documento de anuência e outorga.', '#', 'gerado', 'high-tower', 2, 1]);
  ins.run(['termo-emprestimo', 'Termo de Ciência e Anuência para Empréstimo', 'Termo', 'Documento relacionado ao financiamento da produção.', '#', 'pendente', 'high-tower', 2, 1]);
  ins.run(['permuta', 'Contrato de Permuta', 'Permuta', 'Permuta de terreno por unidades futuras.', '#', 'disponivel', 'reserva-verde', null, 2]);
}

// Corrige contratos com formLink placeholder
db.prepare(
  "UPDATE contratos SET formLink = 'https://docs.google.com/forms/d/10F6hk-zWLtZkzk2Xhnn-X1Tu5q2UVh9WXmlBOfu_5EU/viewform' WHERE formLink = '#' OR formLink IS NULL"
).run();

// Seed financeiro
if (db.prepare('SELECT COUNT(*) as n FROM financeiro').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO financeiro (id, empreendimentoId, categoria, tipo, valor, data, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  ins.run([1, 'high-tower', 'Venda', 'entrada', 53000, '2026-04-20', 'Sinal da unidade 1001']);
  ins.run([2, 'high-tower', 'Obra', 'saida', 12000, '2026-04-18', 'Pagamento de fornecedor']);
  ins.run([3, 'high-tower', 'Venda', 'entrada', 10000, '2026-04-25', 'Parcela mensal da unidade 1001']);
  ins.run([4, 'reserva-verde', 'Projeto', 'saida', 8000, '2026-04-22', 'Serviços iniciais de arquitetura']);
  ins.run([5, 'reserva-verde', 'Reserva', 'entrada', 15000, '2026-04-26', 'Reserva de unidade 202']);
}

// Seed documentos
if (db.prepare('SELECT COUNT(*) as n FROM documentos').get().n === 0) {
  const ins = db.prepare(
    'INSERT INTO documentos (id, tipo, nome, empreendimentoId, unidadeId, clienteId, caminho, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  ins.run([1, 'contrato', 'Contrato Promessa - Unidade 1001', 'high-tower', 2, 1, '/storage/documentos/high-tower/contratos/contrato-1001.pdf', '2026-04-26']);
  ins.run([2, 'termo', 'Termo de Anuência', 'high-tower', 2, 1, '/storage/documentos/high-tower/termos/termo-1001.pdf', '2026-04-26']);
}

module.exports = db;
