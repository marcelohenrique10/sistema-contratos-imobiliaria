/**
 * Gera o Formulário Contratual De Marchi completo.
 *
 * COMO USAR
 *   1. Acesse script.google.com → Novo projeto
 *   2. Cole este arquivo inteiro
 *   3. Selecione a função "criarFormularioContratual" e clique em Executar
 *   4. Autorize quando o Google pedir (é a sua conta criando um formulário seu)
 *   5. Veja o log (Ctrl+Enter) com o link de edição e o de resposta
 *
 * O formulário ATUAL não é tocado. Este script cria um novo, do zero.
 *
 * REGRA IMPORTANTE
 *   Cada pergunta tem título ÚNICO. Títulos repetidos viram colunas com o
 *   mesmo cabeçalho na planilha, e o n8n perde dado quando isso acontece.
 *   Os títulos são o contrato com o nó "Extrair Campos" do n8n — mudar um
 *   aqui exige mudar lá.
 */

// Precisa espelhar os empreendimentos cadastrados no sistema.
// Ao cadastrar um empreendimento novo, acrescente aqui e rode de novo.
var EMPREENDIMENTOS = [
  'High Tower Jardins',
  'Reserva Verde'
];

var TIPO_COMPRA_VENDA = 'Contrato de Promessa de Compra e Venda';
var TIPO_ANEXO        = 'Anexo ao Contrato de Promessa de Compra e Venda';
var TIPO_ANUENCIA     = 'Termo de Anuência com Outorga de Poderes';
var TIPO_EMPRESTIMO   = 'Termo de Ciência e Anuência para Empréstimo';
var TIPO_SCP          = 'Termo de Adesão Preliminar SCP';

var ESTADOS_CIVIS = [
  'Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União estável', 'Outro'
];

var FORMAS_PAGAMENTO = [
  'Dinheiro', 'Transferência/PIX', 'Financiamento', 'Apartamento', 'Permuta', 'Outro'
];

var INDICES = ['INCC', 'IGP-M', 'IPCA', 'Outro'];


function criarFormularioContratual() {
  var form = FormApp.create('Formulário Contratual De Marchi');

  form.setTitle('Formulário Contratual De Marchi');
  form.setDescription(
    'Preenchimento dos dados para geração automática de contratos e termos.\n' +
    'As perguntas variam conforme o tipo de contratante e o documento escolhido.'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setAllowResponseEdits(true);

  // ------------------------------------------------------------------
  // SEÇÃO 1 (inicial) — Dados gerais
  // ------------------------------------------------------------------
  form.addListItem()
    .setTitle('Empreendimento')
    .setHelpText('Empreendimento ao qual esta operação pertence.')
    .setChoiceValues(EMPREENDIMENTOS)
    .setRequired(true);

  form.addTextItem()
    .setTitle('Número da unidade')
    .setHelpText('Somente o número, como aparece no espelho de vendas. Ex: 1002')
    .setRequired(true);

  form.addDateItem()
    .setTitle('Data do documento')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Cidade/UF da assinatura - ex:(Aracruz/ES)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Responsável interno pelo preenchimento')
    .setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 2 — Tipo de contratante (ramifica)
  // ------------------------------------------------------------------
  form.addPageBreakItem().setTitle('Contratante');
  var perguntaTipoPessoa = form.addMultipleChoiceItem()
    .setTitle('O contratante é pessoa física ou jurídica?')
    .setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 3 — Pessoa física
  // ------------------------------------------------------------------
  var secPF = form.addPageBreakItem().setTitle('Dados do comprador (pessoa física)');
  form.addTextItem().setTitle('Nome completo do comprador').setRequired(true);
  form.addTextItem().setTitle('CPF do comprador').setRequired(true);
  form.addTextItem().setTitle('Nacionalidade do comprador').setRequired(true);
  form.addListItem().setTitle('Estado civil do comprador')
    .setChoiceValues(ESTADOS_CIVIS).setRequired(true);
  form.addTextItem().setTitle('Profissão do comprador').setRequired(true);
  form.addTextItem().setTitle('RG do comprador').setRequired(true);
  form.addTextItem().setTitle('Órgão emissor do RG do comprador').setRequired(true);
  form.addTextItem().setTitle('Endereço completo do comprador').setRequired(true);
  form.addTextItem().setTitle('CEP do comprador').setRequired(true);
  form.addTextItem().setTitle('Telefone com DDD do comprador').setRequired(true);
  form.addTextItem().setTitle('E-mail do comprador').setRequired(true);

  var perguntaConjuge = form.addMultipleChoiceItem()
    .setTitle('O comprador possui cônjuge que deve constar no documento?')
    .setHelpText('Se sim, os dados do cônjuge serão pedidos na etapa seguinte.')
    .setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 4 — Pessoa jurídica
  // ------------------------------------------------------------------
  var secPJ = form.addPageBreakItem().setTitle('Dados do contratante (pessoa jurídica)');
  form.addTextItem().setTitle('Razão social do contratante').setRequired(true);
  form.addTextItem().setTitle('CNPJ do contratante').setRequired(true);
  form.addTextItem().setTitle('Endereço completo do contratante PJ').setRequired(true);
  form.addTextItem().setTitle('CEP do contratante PJ').setRequired(true);
  form.addTextItem().setTitle('Telefone com DDD do contratante PJ').setRequired(true);
  form.addTextItem().setTitle('E-mail do contratante PJ').setRequired(true);

  form.addSectionHeaderItem()
    .setTitle('Representante legal')
    .setHelpText('Quem assina o contrato em nome da empresa.');
  form.addTextItem().setTitle('Nome do representante legal').setRequired(true);
  form.addTextItem().setTitle('CPF do representante legal').setRequired(true);
  form.addTextItem().setTitle('RG do representante legal').setRequired(true);
  form.addTextItem().setTitle('Órgão emissor do RG do representante legal').setRequired(true);
  form.addTextItem().setTitle('Nacionalidade do representante legal').setRequired(true);
  form.addTextItem().setTitle('Profissão do representante legal').setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 5 — Cônjuge
  // ------------------------------------------------------------------
  var secConjuge = form.addPageBreakItem().setTitle('Dados do cônjuge');
  form.addTextItem().setTitle('Nome completo do cônjuge').setRequired(true);
  form.addTextItem().setTitle('CPF do cônjuge').setRequired(true);
  form.addTextItem().setTitle('Nacionalidade do cônjuge').setRequired(true);
  form.addTextItem().setTitle('Profissão do cônjuge').setRequired(true);
  form.addTextItem().setTitle('RG do cônjuge').setRequired(true);
  form.addTextItem().setTitle('Órgão emissor do RG do cônjuge').setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 6 — Unidade (comum a todos) + escolha do documento (ramifica)
  // ------------------------------------------------------------------
  var secUnidade = form.addPageBreakItem().setTitle('Unidade e documento');
  form.addTextItem().setTitle('Tipo da unidade - ex:(apartamento)').setRequired(true);
  form.addTextItem().setTitle('Número da unidade por extenso')
    .setHelpText('Ex: mil e dois').setRequired(true);

  var perguntaDocumento = form.addMultipleChoiceItem()
    .setTitle('Qual documento você deseja gerar?')
    .setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 7 — Compra e venda: detalhes da unidade e preço (ramifica)
  // ------------------------------------------------------------------
  var secCompraVenda = form.addPageBreakItem().setTitle('Detalhes da unidade e preço');
  form.addTextItem().setTitle('Quantidade de vagas de garagem').setRequired(true);
  form.addTextItem().setTitle('Números das vagas')
    .setHelpText('Ex: 12 e 13').setRequired(false);
  form.addTextItem().setTitle('Área privativa (m²)').setRequired(true);
  form.addTextItem().setTitle('Área de construção (m²)').setRequired(true);
  form.addTextItem().setTitle('Fração ideal').setRequired(true);
  form.addParagraphTextItem()
    .setTitle('Descrição da planta - ex:( 3 quartos, 1 suíte, varanda gourmet...)')
    .setRequired(false);
  form.addTextItem().setTitle('Preço total do imóvel (R$)')
    .setHelpText('Ex: R$ 733.000,00').setRequired(true);
  form.addTextItem().setTitle('Preço total por extenso').setRequired(true);

  var perguntaFormaAquisicao = form.addMultipleChoiceItem()
    .setTitle('Forma de aquisição')
    .setHelpText('Parcelamento e correção monetária só se aplicam à compra parcelada.')
    .setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 8 — Parcelamento
  // ------------------------------------------------------------------
  var secParcelas = form.addPageBreakItem().setTitle('Parcelamento');
  form.addListItem()
    .setTitle('Quantos tipos de parcelas existem nesta negociação?')
    .setHelpText('Preencha abaixo apenas a quantidade informada aqui.')
    .setChoiceValues(['1', '2', '3', '4', '5'])
    .setRequired(true);

  for (var n = 1; n <= 5; n++) {
    form.addSectionHeaderItem().setTitle('Parcela ' + n);
    form.addTextItem().setTitle('Tipo da parcela ' + n)
      .setHelpText('Ex: Sinal, Mensais, Intermediária, Chaves').setRequired(n === 1);
    form.addTextItem().setTitle('Data inicial de vencimento da parcela ' + n)
      .setHelpText('Formato DD/MM/AAAA').setRequired(false);
    form.addTextItem().setTitle('Valor unitário da parcela ' + n)
      .setHelpText('Valor de UMA parcela. Ex: R$ 10.000,00').setRequired(false);
    form.addTextItem().setTitle('Quantidade da parcela ' + n)
      .setHelpText('Quantas vezes esta parcela se repete. Ex: 08').setRequired(false);
    form.addTextItem().setTitle('Percentual da parcela ' + n).setRequired(false);
    form.addMultipleChoiceItem().setTitle('A parcela ' + n + ' é reajustável?')
      .setChoiceValues(['Sim', 'Não']).setRequired(false);
    form.addListItem().setTitle('Índice da parcela ' + n)
      .setHelpText('Preencher somente se a parcela for reajustável.')
      .setChoiceValues(INDICES).setRequired(false);
    form.addListItem().setTitle('Forma de pagamento da parcela ' + n)
      .setChoiceValues(FORMAS_PAGAMENTO).setRequired(false);
  }

  // ------------------------------------------------------------------
  // SEÇÃO 9 — Empréstimo
  // ------------------------------------------------------------------
  var secEmprestimo = form.addPageBreakItem().setTitle('Dados do empréstimo');
  form.addTextItem().setTitle('Data do compromisso de compra e venda')
    .setHelpText('Formato DD/MM/AAAA').setRequired(true);
  form.addSectionHeaderItem().setTitle('Instituição credora');
  form.addTextItem().setTitle('Nome da Pessoa Jurídica').setRequired(true);
  form.addTextItem().setTitle('CNPJ da Pessoa Jurídica').setRequired(true);
  form.addTextItem().setTitle('Endereço completo da Pessoa Jurídica').setRequired(true);
  form.addTextItem().setTitle('CEP da Pessoa Jurídica').setRequired(true);
  form.addTextItem().setTitle('Endereço do imóvel').setRequired(true);
  form.addMultipleChoiceItem().setTitle('Residência?')
    .setChoiceValues(['Sim', 'Não']).setRequired(false);

  // ------------------------------------------------------------------
  // SEÇÃO 10 — SCP
  // ------------------------------------------------------------------
  var secScp = form.addPageBreakItem().setTitle('Dados da SCP');
  form.addTextItem().setTitle('Razão social do empreendimento').setRequired(true);
  form.addTextItem().setTitle('CNPJ do empreendimento').setRequired(true);
  form.addTextItem().setTitle('Endereço completo da empresa').setRequired(true);
  form.addTextItem().setTitle('CEP da empresa').setRequired(true);
  form.addTextItem().setTitle('Valor da Entrada').setRequired(true);
  form.addTextItem().setTitle('Número de Unidades').setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 11 — Intermediação (ramifica)
  // ------------------------------------------------------------------
  var secIntermediadora = form.addPageBreakItem().setTitle('Intermediação');
  var perguntaIntermediadora = form.addMultipleChoiceItem()
    .setTitle('Existe construtora intermediadora nesta operação?')
    .setRequired(true);

  // ------------------------------------------------------------------
  // SEÇÃO 12 — Dados da intermediadora
  // ------------------------------------------------------------------
  var secIntermediadoraDados = form.addPageBreakItem().setTitle('Dados da intermediadora');
  form.addTextItem().setTitle('Razão social da intermediadora').setRequired(true);
  form.addTextItem().setTitle('CNPJ da intermediadora').setRequired(true);
  form.addTextItem().setTitle('CRECI da intermediadora').setRequired(false);
  form.addTextItem().setTitle('Endereço completo da intermediadora').setRequired(false);
  form.addTextItem().setTitle('Nome do representante da intermediadora').setRequired(false);

  // ------------------------------------------------------------------
  // SEÇÃO 13 — Testemunhas
  // ------------------------------------------------------------------
  var secTestemunhas = form.addPageBreakItem().setTitle('Testemunhas');
  form.addTextItem().setTitle('Nome da testemunha 1').setRequired(false);
  form.addTextItem().setTitle('CPF da testemunha 1').setRequired(false);
  form.addTextItem().setTitle('Nome da testemunha 2').setRequired(false);
  form.addTextItem().setTitle('CPF da testemunha 2').setRequired(false);

  // ------------------------------------------------------------------
  // SEÇÃO 14 — Observações
  // ------------------------------------------------------------------
  var secObservacoes = form.addPageBreakItem().setTitle('Observações finais');
  form.addMultipleChoiceItem()
    .setTitle('Existe alguma observação especial na negociação?')
    .setChoiceValues(['Sim', 'Não']).setRequired(false);
  form.addParagraphTextItem()
    .setTitle('Descreva a observação especial').setRequired(false);
  form.addMultipleChoiceItem()
    .setTitle('Existe personalização de unidade / ajuste comercial que precisa constar?')
    .setChoiceValues(['Sim', 'Não']).setRequired(false);
  form.addParagraphTextItem()
    .setTitle('Descreva a personalização / ajuste').setRequired(false);

  // ==================================================================
  // Roteamento — feito no fim, quando todas as seções já existem
  // ==================================================================
  perguntaTipoPessoa.setChoices([
    perguntaTipoPessoa.createChoice('Pessoa física', secPF),
    perguntaTipoPessoa.createChoice('Pessoa jurídica (CNPJ)', secPJ)
  ]);

  perguntaConjuge.setChoices([
    perguntaConjuge.createChoice('Sim', secConjuge),
    perguntaConjuge.createChoice('Não', secUnidade)
  ]);

  // Pessoa jurídica não tem cônjuge
  secPJ.setGoToPage(secUnidade);
  secConjuge.setGoToPage(secUnidade);

  // Anexo e Anuência não pedem preço nem parcelas: vão direto à intermediação
  perguntaDocumento.setChoices([
    perguntaDocumento.createChoice(TIPO_COMPRA_VENDA, secCompraVenda),
    perguntaDocumento.createChoice(TIPO_ANEXO, secIntermediadora),
    perguntaDocumento.createChoice(TIPO_ANUENCIA, secIntermediadora),
    perguntaDocumento.createChoice(TIPO_EMPRESTIMO, secEmprestimo),
    perguntaDocumento.createChoice(TIPO_SCP, secScp)
  ]);

  perguntaFormaAquisicao.setChoices([
    perguntaFormaAquisicao.createChoice('À vista', secIntermediadora),
    perguntaFormaAquisicao.createChoice('Parcelado', secParcelas)
  ]);

  secParcelas.setGoToPage(secIntermediadora);
  secEmprestimo.setGoToPage(secIntermediadora);
  secScp.setGoToPage(secIntermediadora);

  perguntaIntermediadora.setChoices([
    perguntaIntermediadora.createChoice('Sim', secIntermediadoraDados),
    perguntaIntermediadora.createChoice('Não', secTestemunhas)
  ]);

  secIntermediadoraDados.setGoToPage(secTestemunhas);
  secTestemunhas.setGoToPage(secObservacoes);
  secObservacoes.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  Logger.log('Formulario criado com sucesso.');
  Logger.log('Editar   : ' + form.getEditUrl());
  Logger.log('Responder: ' + form.getPublishedUrl());
  Logger.log('');
  Logger.log('PROXIMO PASSO: no formulario, aba Respostas -> vincular a uma');
  Logger.log('planilha. Depois aponte o gatilho do n8n para essa planilha nova.');
}


/**
 * Confere se algum título de pergunta ficou repetido — títulos repetidos
 * viram colunas iguais na planilha e o n8n perde dado.
 * Rode depois de criar, passando a URL de edição.
 */
function verificarTitulosDuplicados(urlEdicao) {
  var form = FormApp.openByUrl(urlEdicao);
  var vistos = {};
  var duplicados = [];

  form.getItems().forEach(function (item) {
    var tipo = item.getType();
    if (tipo === FormApp.ItemType.PAGE_BREAK || tipo === FormApp.ItemType.SECTION_HEADER) return;

    var titulo = item.getTitle().trim();
    if (vistos[titulo]) {
      duplicados.push(titulo);
    }
    vistos[titulo] = true;
  });

  if (duplicados.length) {
    Logger.log('TITULOS DUPLICADOS encontrados:');
    duplicados.forEach(function (t) { Logger.log('  - ' + t); });
  } else {
    Logger.log('Nenhum titulo duplicado. Formulario ok.');
  }
}
