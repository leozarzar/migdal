# WCM App — Copilot Instructions

## Project Overview
Warehouse Control Management (WCM): gestão de estoque, pedidos, recebimentos e cadastros para ambiente industrial/distribuição.

- **Stack**: Node.js + Express 5, SQLite3 (sem ORM), Vanilla JS (zero frameworks), CSS puro
- **Dois frontends**: `frontend/desktop/` e `frontend/mobile/` — nunca misturar código entre eles
- **Sem bundler**: arquivos carregados em ordem via `<script>` e `<link>` em `index.html`. Não usar `import/export` ou ES modules.
- Todas as funções de tela e utilitários são **globals**.

---

## Screen Object Pattern (padrão canônico de tela)

Toda tela é um **objeto literal** com a seguinte estrutura. Ver `stock-units.js` e `orders.js` como referência.

```js
// ── Estado ──────────────────────────────────────────────────
const MyScreen = {
    _myDialog: null,
    _filterValue: '',

// ── Ciclo de Vida ────────────────────────────────────────────
    render() {
        this._myDialog?.destroy(); this._myDialog = null; // destruir componentes antes de recriar
        return `<div class="my-screen-container">...</div>`;
    },

    async load() {
        this._filterValue = localStorage.getItem('wcm.myScreen.filter') || '';
        const data = await apiCall(API + '/my-screen');
        this._renderTable(data);
    },

// ── Ações Públicas ───────────────────────────────────────────
    async deleteItem(event, id) {
        if (!confirm('Confirma exclusão?')) return;
        try {
            await apiCall(API + `/my-screen/${id}`, { method: 'DELETE' });
            await this.load();
        } catch (e) { alert(e.message); }
    },

// ── Renderização ─────────────────────────────────────────────
    _renderTable(items) { ... },
    _createTableRow(item) { ... }
};
```

- `render()` → retorna string HTML; chamado pelo router antes do `load()`
- `async load()` → busca dados e popula o DOM; **sempre** usa `await`
- Métodos usados em `onclick=` inline **devem ser públicos** (sem `_`)
- Métodos internos usam prefixo `_`

---

## Roteamento

O router em `frontend/desktop/app.js` chama `render()` depois `load()`. Telas que têm edições não salvas implementam `canLeave()`:

```js
async canLeave() {
    if (!this._hasUnsavedChanges()) return true;
    return confirm('Deseja sair sem salvar?');
}
```

---

## Componentes Reutilizáveis (Factory Functions)

Usar **sempre** as factory functions — nunca manipular o DOM de diálogos/selects diretamente.

```js
// Dialog
this._dialog = createDialog({ title: 'Título', content: '...' });
this._dialog.open();

// SearchSelect
this._supplierSelect = createSearchSelect({ placeholder: 'Buscar fornecedor...' });
this._supplierSelect.mount(document.querySelector('.my-container'));
this._supplierSelect.setItems(suppliers.map(s => ({ id: s.id, label: s.name })));
```

Sempre destruir no início de `render()`:
```js
this._dialog?.destroy(); this._dialog = null;
```

---

## Utilitários Globais (`utils.js`)

Sempre preferir os utilitários existentes em vez de reimplementar.

| Função | Uso |
|---|---|
| `apiCall(url, opts?)` | Substitui `fetch()` — já trata erros |
| `populateSelect(el, items, labelFn, valueFn)` | Popula `<select>` |
| `sumProperty(arr, key)` | Soma propriedade numérica de array |
| `clearTableSelection()` | Remove seleção de linhas da tabela |
| `isAllFieldsFilled(...els)` | Valida campos obrigatórios |
| `calculateDaysDifference(d1, d2)` | Diferença em dias entre datas |
| `getStatusFromDate(date)` | Status baseado em data (`ok`, `warning`, `danger`) |
| `toggleElement(el, visible)` | Alterna visibilidade |

---

## Convenções de Código

- **Nomes**: `camelCase` no JS, `snake_case` em colunas DB e campos de API
- **Idioma**: labels para o usuário em **português**; identificadores DB/API em **inglês**
- **Banners de seção**: `// ── Estado ──────`, `// ── Ciclo de Vida ──────`, `// ── Ações Públicas ──────`, `// ── Renderização ──────`
- **JSDoc** em funções públicas e factory functions
- **Async**: `async/await` + `for...of` — nunca `forEach` com lógica assíncrona
- **Erros**: `try/catch` em toda operação assíncrona; `alert(e.message)` para erros visíveis ao usuário
- **Filtros**: persistir em `localStorage` com chave `wcm.{tela}.{filtro}` e restaurar no `load()`

### Escopo global e colisões de nomes

Como não há bundler, todos os arquivos compartilham o mesmo escopo global. Dois tipos de colisão devem ser evitados:

**IDs de elementos HTML** — Múltiplos arquivos de tela podem existir simultaneamente no DOM (sistema de abas). Todo `id=` dentro do HTML de uma tela **deve ser prefixado com o nome da tela**:
```html
<!-- ✅ correto -->
<tbody id="ordersTableBody"></tbody>
<button id="materialsCancelBtn">Cancelar</button>

<!-- ❌ errado — colide entre abas -->
<tbody id="tableBody"></tbody>
<button id="cancelBtn">Cancelar</button>
```

**Símbolos JavaScript no topo do arquivo** — Funções auxiliares e constantes declaradas fora do objeto de tela são globais. Se dois arquivos declararem `function formatRow()` ou `const STATUS_MAP = ...`, o segundo sobrescreve o primeiro silenciosamente. Regras:
- Todo estado e lógica da tela deve viver **dentro do objeto literal** (como propriedades ou métodos)
- Funções auxiliares exclusivas de uma tela que precisem ficar fora do objeto devem ter nome prefixado: `function _ordersFormatRow()` ou ser movidas para dentro do objeto como `_formatRow()`
- Utilitários verdadeiramente compartilhados vão em `utils.js`

---

## CSS

- Um arquivo `*-style.css` por tela ou componente, carregado em `index.html`
- Classes prefixadas pelo nome da tela: `.stock-units-container`, `.orders-card`
- Nunca estilos inline — sempre via classes CSS
- Nunca usar frameworks CSS (Tailwind, Bootstrap, etc.)

---

## Backend (Rotas Express)

```js
// Cada rota cria sua própria tabela na inicialização
db.run(`CREATE TABLE IF NOT EXISTS my_table (...)`);
db.run(`ALTER TABLE my_table ADD COLUMN new_col TEXT`, () => {}); // falha silenciosa = esperada

// Padrão de resposta de erro
if (err) return res.status(500).json({ success: false, message: 'Descrição.', error: err.message });
```

- Sem ORM: `db.all()`, `db.run()`, `db.get()` com callbacks diretos
- Migrations são `ALTER TABLE` additive — sem framework, sem arquivos de migração separados
- Agrupar rotas por domínio: estoque, suprimentos, cadastros

---

## Eliminação de Duplicação

Sempre que identificar código duplicado — seja em uma tela, entre telas ou entre rotas do backend — sugerir ativamente a extração para uma abstração adequada:

- Lógica reutilizável no frontend → função em `utils.js`
- Renderização repetida → método `_create*` ou helper privado na própria tela
- Lógica de negócio no backend repetida entre rotas → função auxiliar no próprio arquivo de rota ou módulo compartilhado

Apontar a duplicação com um comentário objetivo antes de implementar a abstração, ex: *"Este trecho repete o padrão de X — posso extrair para `utils.js`?"*

---

## Segurança

- Usar `_esc(str)` (disponível em `dialog.js` e `search-select.js`) ao inserir dados do usuário em HTML via template strings
- Nunca usar `innerHTML` com dados não escapados
- Queries SQL com parâmetros posicionais `?` — nunca interpolação de string em SQL

## Resposta Final

- A resposta final no chat deve ser sempre em português, mesmo que o código seja em inglês