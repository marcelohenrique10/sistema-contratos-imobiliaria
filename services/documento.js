const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const docx = require('./docx');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const caminhos = require('../caminhos');
const STORAGE_DIR = path.join(caminhos.STORAGE, 'documentos');

// Nome do tipo escolhido no formulário -> arquivo de modelo
const MODELOS = {
  'Contrato de Promessa de Compra e Venda': 'contrato-promessa-compra-venda.docx',
  'Anexo ao Contrato de Promessa de Compra e Venda': 'anexo-promessa-compra-venda.docx',
  'Termo de Anuência com Outorga de Poderes': 'termo-anuencia-outorga-poderes.docx',
  'Termo de Ciência e Anuência para Empréstimo': 'termo-ciencia-anuencia-emprestimo.docx',
  'Termo de Adesão Preliminar SCP': 'termo-adesao-preliminar-scp.docx'
};

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function juntar(...partes) {
  return partes.filter((p) => p && String(p).trim()).join(', ');
}

// O formulário aceita "733.000,00" ou "R$ 733.000,00"; o contrato precisa
// sempre do prefixo.
function comReal(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';
  return /^r\$/i.test(texto) ? texto : `R$ ${texto}`;
}

// "Parcelado" / "À vista" -> como a frase do contrato pede: "de forma ..."
function textoFormaAquisicao(forma) {
  const texto = String(forma ?? '').trim().toLowerCase();
  if (!texto) return 'parcelada';
  return texto.includes('vista') ? 'à vista' : 'parcelada';
}

// Aceita dd/mm/aaaa e aaaa-mm-dd, que são os dois formatos que o Google Forms
// devolve dependendo de como a pergunta foi configurada.
function parsearData(valor) {
  const texto = String(valor || '').trim();

  let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  return null;
}

function formatarData(data) {
  if (!data) return '';
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${data.getFullYear()}`;
}

function adicionarMeses(data, meses) {
  const nova = new Date(data.getTime());
  const diaOriginal = nova.getDate();
  nova.setMonth(nova.getMonth() + meses);
  // Evita 31/01 + 1 mês virar 03/03 em fevereiro
  if (nova.getDate() < diaOriginal) nova.setDate(0);
  return nova;
}

function montarValores(documento, empreendimento, extras = {}) {
  const geral = documento.dadosGerais || {};
  const comprador = documento.comprador || {};
  const conjuge = documento.conjuge || {};
  const testemunhas = documento.testemunhas || [];
  const compraVenda = documento.compraVenda || {};
  const unidade = compraVenda.unidade || {};
  const anexo = documento.anexo || {};
  const scp = documento.scp || {};
  const emp = empreendimento || {};

  const data = parsearData(geral.dataDocumento) || parsearData(geral.dataHora);

  return {
    COMPRADOR_NOME: comprador.nome,
    COMPRADOR_CPF: comprador.cpf,
    COMPRADOR_NACIONALIDADE: comprador.nacionalidade,
    COMPRADOR_ESTADO_CIVIL: comprador.estadoCivil,
    COMPRADOR_PROFISSAO: comprador.profissao,
    COMPRADOR_RG: comprador.rg,
    COMPRADOR_ORGAO_EMISSOR: comprador.orgaoEmissorRg,
    COMPRADOR_ENDERECO: juntar(comprador.endereco, comprador.cep),
    COMPRADOR_TELEFONE: comprador.telefone,
    COMPRADOR_EMAIL: comprador.email,

    CONJUGE_NOME: conjuge.nome,
    CONJUGE_CPF: conjuge.cpf,
    CONJUGE_NACIONALIDADE: conjuge.nacionalidade,
    CONJUGE_PROFISSAO: conjuge.profissao,
    CONJUGE_RG: conjuge.rg,
    CONJUGE_ORGAO_EMISSOR: conjuge.orgaoEmissorRg,

    EMPREENDIMENTO_NOME: emp.nome,
    EMPREENDIMENTO_RAZAO_SOCIAL: emp.razaoSocial || scp.razaoSocial,
    EMPREENDIMENTO_CNPJ: emp.cnpj || scp.cnpj,
    EMPREENDIMENTO_ENDERECO: emp.endereco,
    EMPREENDIMENTO_CEP: emp.cep,
    EMPREENDIMENTO_SOCIO_ADMIN: emp.socioAdmin,
    EMPREENDIMENTO_EMAIL: emp.email,

    UNIDADE_NUMERO_EXTENSO: unidade.numeroExtenso || anexo.numeroUnidadeExtenso,
    UNIDADE_VAGAS: unidade.vagasGaragem,
    UNIDADE_NUMEROS_VAGAS: unidade.numerosVagas,
    UNIDADE_AREA_PRIVATIVA: unidade.areaPrivativa,
    UNIDADE_AREA_CONSTRUCAO: unidade.areaConstrucao,
    UNIDADE_FRACAO_IDEAL: unidade.fracaoIdeal,
    UNIDADE_DESCRICAO_PLANTA: unidade.descricaoPlanta,

    PRECO_TOTAL: comReal(compraVenda.precoTotal),
    PRECO_TOTAL_EXTENSO: compraVenda.precoExtenso,
    FORMA_AQUISICAO: textoFormaAquisicao(compraVenda.formaAquisicao),

    // Nem todo tipo de documento traz bloco de unidade (o Termo de Anuência,
    // por exemplo), mas o número sempre chega junto do payload.
    UNIDADE_NUMERO: unidade.numero || anexo.numeroUnidade || scp.numeroUnidades || extras.unidadeNumero,
    UNIDADE_TIPO: unidade.tipo || anexo.tipoUnidade || extras.unidadeTipo,

    DOC_DATA: formatarData(data),
    DOC_DIA: data ? String(data.getDate()).padStart(2, '0') : '',
    DOC_MES: data ? MESES[data.getMonth()] : '',
    DOC_ANO: data ? String(data.getFullYear()) : '',

    DATA_COMPROMISSO_COMPRA_VENDA: formatarData(parsearData(geral.dataDocumento)),
    SCP_VALOR_ENTRADA: scp.valorEntrada,

    TESTEMUNHA_1_NOME: testemunhas[0] ? testemunhas[0].nome : '',
    TESTEMUNHA_1_CPF: testemunhas[0] ? testemunhas[0].cpf : '',
    TESTEMUNHA_2_NOME: testemunhas[1] ? testemunhas[1].nome : '',
    TESTEMUNHA_2_CPF: testemunhas[1] ? testemunhas[1].cpf : ''
  };
}

// ---------- Tabela de parcelas ----------

function textoReajuste(parcela) {
  const reajustavel = String(parcela.reajustavel || '').trim().toLowerCase();
  if (!reajustavel.startsWith('s')) return 'Não';
  return parcela.indice ? `Sim – ${parcela.indice}` : 'Sim';
}

/**
 * Reconstrói a tabela de parcelas a partir das respostas do formulário.
 *
 * O modelo traz três formatos de linha, que são reaproveitados como molde:
 *  - linha 1: parcela única (uma data só)
 *  - linhas 2+3: parcela repetida (célula mesclada com "De ..." / "Até ...")
 *  - última linha: total
 */
function montarTabelaParcelas(xml, compraVenda) {
  const parcelas = (compraVenda.parcelas || []).filter((p) => p.tipo);

  // Compra à vista não tem parcelas, mas a tabela do modelo precisa ser
  // substituída mesmo assim — senão o contrato sai com o exemplo do modelo.
  const aVista = compraVenda.aVista || (!parcelas.length && compraVenda.precoTotal);

  if (!parcelas.length && !aVista) return xml;

  const tabela = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  if (!tabela) return xml;

  const linhas = docx.extrairLinhas(tabela[0]);
  if (linhas.length < 11) return xml;

  const moldeCabecalho = linhas[0];
  const moldeSimples = linhas[1];
  const moldeIntervaloInicio = linhas[2];
  const moldeIntervaloFim = linhas[3];
  const moldeTotal = linhas[linhas.length - 1];

  const novas = [moldeCabecalho];

  if (!parcelas.length) {
    novas.push(docx.definirTextosLinha(moldeSimples, [
      'À vista',
      compraVenda.dataPagamento || '',
      compraVenda.precoTotal || '',
      '01',
      '100%',
      'Não',
      compraVenda.formaPagamentoAVista || ''
    ]));
    novas.push(docx.definirTextosLinha(moldeTotal, [
      'Total', null, compraVenda.precoTotal || '', null, '100%', null, null
    ]));
    return docx.substituirLinhasDaPrimeiraTabela(xml, novas);
  }

  parcelas.forEach((parcela) => {
    const quantidade = parseInt(String(parcela.quantidade || '1').replace(/\D/g, ''), 10) || 1;
    const inicio = parsearData(parcela.vencimentoInicial);
    const colunas = [
      parcela.tipo,
      null, // data: tratada abaixo
      parcela.valorUnitario,
      String(parcela.quantidade || quantidade).padStart(2, '0'),
      parcela.percentual,
      textoReajuste(parcela),
      parcela.formaPagamento
    ];

    if (quantidade > 1 && inicio) {
      const fim = adicionarMeses(inicio, quantidade - 1);
      colunas[1] = `De ${formatarData(inicio)}`;
      novas.push(docx.definirTextosLinha(moldeIntervaloInicio, colunas));
      // Na linha de continuação só a coluna de data tem conteúdo próprio
      novas.push(docx.definirTextosLinha(moldeIntervaloFim, [null, `Até ${formatarData(fim)}`]));
    } else {
      colunas[1] = inicio ? formatarData(inicio) : (parcela.vencimentoInicial || '');
      novas.push(docx.definirTextosLinha(moldeSimples, colunas));
    }
  });

  novas.push(docx.definirTextosLinha(moldeTotal, [
    'Total', null, compraVenda.precoTotal || '', null, '100%', null, null
  ]));

  return docx.substituirLinhasDaPrimeiraTabela(xml, novas);
}

// ---------- Geração ----------

function nomeArquivo(tipo, comprador, extensao) {
  const base = `${tipo} - ${comprador || 'sem-nome'}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base}-${Date.now()}.${extensao}`;
}

function converterParaPdf(caminhoDocx) {
  return new Promise((resolve, reject) => {
    const soffice = process.env.LIBREOFFICE_PATH || 'soffice';
    const perfil = `-env:UserInstallation=file:///${path.join(require('os').tmpdir(), 'lo_contratos').replace(/\\/g, '/')}`;

    execFile(
      soffice,
      [perfil, '--headless', '--convert-to', 'pdf', '--outdir', path.dirname(caminhoDocx), caminhoDocx],
      { timeout: 120000 },
      (erro) => {
        if (erro) return reject(erro);
        resolve(caminhoDocx.replace(/\.docx$/, '.pdf'));
      }
    );
  });
}

/**
 * Gera o documento a partir do payload do formulário.
 * Devolve { caminhoAbsoluto, caminhoPublico, nome, placeholdersSemValor }.
 */
// Alguns blocos do documento são condicionais: sem cônjuge, os campos dele
// saem vazios de propósito. Avisar sobre eles afogaria o buraco de verdade.
const BLOCOS_CONDICIONAIS = [
  { prefixo: 'CONJUGE_', presente: (d) => Boolean(d.conjuge && d.conjuge.nome) },
  { prefixo: 'TESTEMUNHA_1_', presente: (d) => Boolean((d.testemunhas || [])[0]) },
  { prefixo: 'TESTEMUNHA_2_', presente: (d) => Boolean((d.testemunhas || [])[1]) }
];

/**
 * Separa o que ficou em branco em duas listas: o que falta mesmo e o que
 * não se aplica a este documento.
 *
 * Só entram campos que ESTE modelo usa — o `valores` traz os 45 possíveis,
 * mas cada modelo usa uma fatia. Cobrar o valor da SCP num Anexo é ruído.
 */
function conferirPreenchimento(valores, xml, documento) {
  const noModelo = new Set(docx.listarPlaceholders(xml).map((p) => p.slice(1, -1)));

  const vazios = Object.entries(valores)
    .filter(([chave, v]) => noModelo.has(chave) && (v === undefined || v === null || String(v).trim() === ''))
    .map(([chave]) => chave);

  const ausentes = BLOCOS_CONDICIONAIS
    .filter((b) => !b.presente(documento))
    .map((b) => b.prefixo);

  const condicional = (chave) => ausentes.some((prefixo) => chave.startsWith(prefixo));

  return {
    faltando: vazios.filter((c) => !condicional(c)),
    naoSeAplica: vazios.filter(condicional)
  };
}

async function gerarDocumento({ documento, empreendimento, empreendimentoId, unidadeNumero, unidadeTipo }) {
  const tipo = documento.tipo;
  const modelo = MODELOS[tipo];

  if (!modelo) {
    throw new Error(`Não existe modelo cadastrado para o tipo "${tipo}"`);
  }

  const caminhoModelo = path.join(TEMPLATES_DIR, modelo);
  if (!fs.existsSync(caminhoModelo)) {
    throw new Error(`Modelo não encontrado no disco: ${modelo}`);
  }

  const { zip, xml } = docx.lerDocumentoXml(caminhoModelo);
  const valores = montarValores(documento, empreendimento, { unidadeNumero, unidadeTipo });

  let novoXml = xml;
  if (documento.compraVenda) {
    novoXml = montarTabelaParcelas(novoXml, documento.compraVenda);
  }
  novoXml = docx.substituirPlaceholders(novoXml, valores);

  const pasta = path.join(STORAGE_DIR, empreendimentoId || 'sem-empreendimento', 'contratos');
  fs.mkdirSync(pasta, { recursive: true });

  const nome = nomeArquivo(tipo, (documento.comprador || {}).nome, 'docx');
  const caminhoAbsoluto = path.join(pasta, nome);
  docx.gravarDocumentoXml(zip, novoXml, caminhoAbsoluto);

  let caminhoFinal = caminhoAbsoluto;
  let nomeFinal = nome;

  if (String(process.env.GERAR_PDF).toLowerCase() === 'true') {
    caminhoFinal = await converterParaPdf(caminhoAbsoluto);
    nomeFinal = path.basename(caminhoFinal);
  }

  const relativo = path
    .relative(caminhos.STORAGE, caminhoFinal)
    .replace(/\\/g, '/');

  const { faltando, naoSeAplica } = conferirPreenchimento(valores, xml, documento);

  return {
    caminhoAbsoluto: caminhoFinal,
    caminhoPublico: `/storage/${relativo}`,
    nome: nomeFinal,
    placeholdersSemValor: faltando,
    placeholdersNaoAplicaveis: naoSeAplica
  };
}

module.exports = {
  gerarDocumento, MODELOS, montarValores, conferirPreenchimento,
  parsearData, formatarData, adicionarMeses
};
