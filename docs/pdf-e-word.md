# Word agora, PDF depois

Decidido em 26/08/2026 por Marcelo. **Hoje o sistema entrega só `.docx`.**
Este documento guarda o desenho do PDF já validado, para quando for a hora.

Não é ideia solta: foi testado ponta a ponta, com o contrato de compra e venda
real e dados reais. O que falta é hospedagem, não código de pesquisa.

## O desenho

Dois arquivos do mesmo contrato, e quem baixa escolhe na hora:

| Versão | Cor | Para quê |
|---|---|---|
| **Word** | vermelho preservado | conferir e corrigir |
| **PDF** | tudo preto | versão final, para o cliente |

O vermelho no Word deixa de ser rascunho e vira ferramenta: marca exatamente o
que a máquina preencheu. Quem revisa bate o olho e confere só aquilo.

A tela de Documentos oferece **Baixar Word** e **Baixar PDF** lado a lado. Sem
flag e sem escolher antes — a pessoa decide conforme o documento tenha ou não
algo a corrigir.

## Isto cancela uma tarefa antiga

Havia uma pendência de "passar o vermelho para preto nos modelos, quando tudo
estiver alinhado". **Não é mais necessária.** Os modelos ficam vermelhos para
sempre; a cor some só na geração do PDF.

Melhor assim: editar 5 modelos à mão é trabalho que se perde na próxima revisão
jurídica, e destrói a marcação que ajuda a conferir.

## Como funciona

O vermelho já está marcado no XML do `.docx`:

```xml
<w:color w:val="ff0000"/>
```

São 239 marcas no contrato de compra e venda, 32 no anexo, 134 no SCP, 40 na
anuência, 46 no empréstimo.

Gerar o PDF é: substituir os placeholders normalmente, remover **só** essa cor,
gravar um `.docx` temporário e converter. Cinza (`555555`) e azul de link
(`1155cc`, `2f5496`) não podem ser tocados — são formatação legítima.

```js
novoXml = novoXml.replace(/<w:color w:val="ff0000"\s*\/>/gi, '');
```

A conversão em si já existe: `converterParaPdf()` em
[services/documento.js](../services/documento.js), via LibreOffice headless.

## O que mudar quando for implementar

1. **`services/documento.js`** — hoje `GERAR_PDF=true` faz o PDF **substituir**
   o `.docx` (`caminhoFinal = await converterParaPdf(...)`). Precisa gerar os
   **dois** e devolver os dois caminhos.
2. **Tabela `documentos`** — uma coluna para o caminho do PDF, ao lado de
   `caminho`. Migração no padrão das outras, em `database.js`.
3. **Tela de Documentos e de Contratos** — segundo botão de download.
4. **Degradação** — sem LibreOffice no servidor, gerar só o Word e mostrar o
   botão de PDF desabilitado, com o motivo. Nada pode quebrar por isso.

## Medições reais (26/08/2026, contrato de compra e venda)

- 22 páginas nas duas versões
- `.docx` 128 KB · `.pdf` 330 KB
- Conversão: **19 s** na primeira (LibreOffice subindo do zero), **6 s** depois

Os 6 s acontecem hoje dentro da chamada do n8n, que fica esperando. Aguenta,
mas se virar gargalo, gerar o PDF em segundo plano depois de responder.

## Hospedagem — é aqui que trava

O LibreOffice é livre e gratuito (já instalado na máquina do Marcelo, em
`C:\Program Files\LibreOffice`). O custo não é licença, é onde ele cabe:
precisa estar instalado no servidor e ocupa de 400 MB a 1 GB.

| Onde | Roda? | Custo |
|---|---|---|
| Vercel, Netlify | **não** (serverless) | — |
| Render / Railway com Docker | sim, apertado no plano free (512 MB) | free com limites |
| Oracle Cloud Always Free | sim, folgado (4 núcleos ARM, 24 GB) | grátis |
| VPS pequeno (Hetzner e afins) | sim | ~R$ 25–35/mês |

Grátis de verdade é possível na Oracle Always Free — em troca de mais trabalho
de configuração que um PaaS de apertar botão.

**Escolher a hospedagem pensando nisto.** Ir para Vercel agora significa não
ter PDF nunca sem trocar de casa depois.

## Achado durante o teste

Só deu para ver renderizando a página: o **rodapé de todas as 22 páginas** do
contrato de compra e venda diz

> CONTRATO DE PERMUTA DE UNIDADES FUTURAS — USO CONFIDENCIAL

É a mesma contaminação entre modelos já registrada em
[templates/README.md](../templates/README.md), agora no rodapé. Ninguém lê
rodapé — passou despercebido em todas as revisões anteriores.

O rodapé traz também `CNPJ 46.439.368/0001-51`, um quarto CNPJ além dos três já
listados. Pode ser legítimo (a incorporadora mãe, não a SPE) — mas entra na
lista do jurídico.
