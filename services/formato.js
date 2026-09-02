/**
 * Pontuação de CPF e CNPJ.
 *
 * Formatar na gravação, e não só na exibição, importa por um motivo prático:
 * o CPF é a chave que liga o cadastro manual à resposta do formulário. Se um
 * lado grava "12345678900" e o outro "123.456.789-00", o sistema cria dois
 * clientes para a mesma pessoa.
 */

function formatarCpfCnpj(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto) return null;

  const digitos = bruto.replace(/\D/g, '');

  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (digitos.length === 14) {
    return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  // Quantidade de dígitos fora do padrão: devolve como veio, sem inventar
  // pontuação. Melhor um cadastro estranho do que um documento adulterado.
  return bruto;
}

/** Só os dígitos — para comparar dois cadastros escritos de formas diferentes. */
function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Esconde o miolo, preservando o suficiente para conferência. */
function mascararContato(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';

  if (texto.includes('@')) {
    const [antes, dominio] = texto.split('@');
    const visivel = antes.slice(0, 2);
    return `${visivel}${'•'.repeat(Math.max(3, antes.length - 2))}@${dominio}`;
  }

  const digitos = texto.replace(/\D/g, '');
  if (digitos.length < 4) return '•'.repeat(texto.length);

  return `${'•'.repeat(Math.max(4, digitos.length - 4))}${digitos.slice(-4)}`;
}

module.exports = { formatarCpfCnpj, somenteDigitos, mascararContato };
