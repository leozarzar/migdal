# Migdal — Warehouse Control Management

Sistema de controle de armazém para gestão de estoque, pedidos, recebimentos e cadastros em ambientes industriais e de distribuição.

---

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Estoque** | Rastreamento de unidades individuais com controle de lote e peso |
| **Monitor de estoque** | Saldo histórico por material com timeline |
| **Políticas de estoque** | Ponto de reposição, estoque de segurança e previsão de demanda com 4 modelos configuráveis |
| **Pedidos** | Gestão de ordens de compra com controle de status |
| **Recebimentos** | Entrada de mercadorias vinculada a pedidos |
| **Notas fiscais** | Registro de notas de compra (NCI) |
| **Fornecedores / Operadores** | Cadastros de parceiros e colaboradores |
| **Materiais / Grupos** | Catálogo de materiais e agrupamentos |
| **Serviços** | Cadastro de serviços prestados |
| **Consumo** | Estatísticas de consumo por material e período |
| **KPIs** | Dashboard com turnover, acuracidade, lead time e cobertura |
| **Notificações** | Alertas automáticos de reposição e vencimento |
| **Relatório semanal** | Gerado automaticamente toda segunda-feira via Google Gemini AI |

---

## Stack

- **Backend**: Node.js + Express 5
- **Banco de dados**: SQLite 3 (sem ORM)
- **Frontend desktop**: Vanilla JS + CSS puro
- **Frontend mobile**: Vanilla JS + CSS puro (mobile-first)
- **Sem bundler**: arquivos carregados via `<script>` e `<link>` no `index.html`

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/)

---

## Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/migdal.git
cd migdal

# Instale as dependências
npm install
```

---

## Configuração

O sistema funciona sem nenhuma configuração adicional. A única variável de ambiente reconhecida é:

| Variável | Necessário para |
|---|---|
| `GEMINI_API_KEY` | Relatório semanal com IA (opcional) |

Se quiser usar o relatório semanal, crie um `.env` na raiz:

```env
GEMINI_API_KEY=sua_chave_aqui
```

---

## Executando

```bash
npm start
```

O servidor inicia na porta `3002`. Acesse:

- **Desktop** → `http://localhost:3002/app`
- **Mobile** → `http://localhost:3002/mobile`

O IP da rede local também é exibido no console para acesso via dispositivos móveis.

---

## Estrutura do projeto

```
backend/
  db.js            → inicialização do banco SQLite
  server.js        → entry point do servidor Express
  routes/          → uma rota por domínio (stock-units, orders, receipts...)

frontend/
  index.html       → SPA desktop
  mobile.html      → SPA mobile
  utils.js         → utilitários globais (apiCall, formatação, etc.)
  desktop/
    app.js         → router desktop
    components/    → dialog, search-select, toast, number-input
    screens/       → uma tela por arquivo (orders.js, receipts.js...)
  mobile/
    app.js         → router mobile
    screens/       → telas mobile
```

---

## Relatório semanal com IA

Todo **segunda-feira às 07:00 (horário de Brasília)**, um cron job agrega os dados operacionais da semana e envia ao **Google Gemini Flash** para gerar um relatório narrativo em português. O relatório é salvo no banco e exibido como notificação no sistema.

Para obter uma chave de API: [Google AI Studio](https://aistudio.google.com/).

---

## Modelos de previsão de demanda

As políticas de estoque suportam quatro modelos configuráveis por item:

| Modelo | Descrição |
|---|---|
| `moving-average` | Média das últimas N semanas |
| `arithmetic` | Média histórica total |
| `exp-smoothing` | Suavização exponencial com parâmetro α |
| `linear-regression` | Regressão linear sobre consumo histórico |

---

## Licença

MIT
