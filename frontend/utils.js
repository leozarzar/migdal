/**
 * ── utils.js ──
 * Utilitários compartilhados para o aplicativo WCM.
 * Funções reutilizáveis de DOM, formatação, validação e comunicação com API.
 */

// ── Cálculos ──

/**
 * Calcula a soma de uma propriedade numérica em um array de objetos.
 * @param {Array} items - Array de objetos
 * @param {string} property - Nome da propriedade a somar
 * @returns {number} Soma total
 */
const sumProperty = (items, property) => 
    items.reduce((sum, item) => sum + parseInt(item[property] || 0), 0);

/**
 * Calcula diferença em dias entre duas datas.
 * @param {Date|string} startDate - Data de início
 * @param {Date|string} endDate - Data final (null/vazio para data atual)
 * @returns {number} Diferença em dias
 */
const calculateDaysDifference = (startDate, endDate = null) => {
    const start = new Date(startDate);
    const end = endDate && endDate.toString().trim() ? new Date(endDate) : new Date();
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
};

// ── Formulários e DOM ──

/**
 * Limpa um conjunto de inputs de um formulário.
 * @param {Array<string>} inputIds - IDs dos inputs a limpar
 */
const clearFormInputs = (inputIds) => {
    inputIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = "";
    });
};

/**
 * Remove classe 'selected' de todas as linhas de tabela.
 */
const clearTableSelection = () => {
    document.querySelectorAll("tr").forEach(tr => tr.classList.remove("selected"));
};

/**
 * Popula um <select> com valores únicos extraídos de uma propriedade.
 * @param {Array} data - Array de objetos
 * @param {string} selectId - ID do select
 * @param {string} property - Propriedade a extrair
 * @param {string} labelText - Texto do primeiro option
 */
const populateSelect = (data, selectId, property, labelText = "Selecionar") => {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;

    const currentValue = selectElement.value;
    const uniqueValues = [...new Set(data
        .map(item => item[property])
        .filter(Boolean)
    )];

    selectElement.innerHTML = `<option value="">${labelText}</option>`;
    uniqueValues.forEach(value => {
        selectElement.innerHTML += `<option value="${value}">${value}</option>`;
    });
    
    selectElement.value = currentValue;
};

/**
 * Alterna visibilidade de um elemento.
 * @param {string} elementId - ID do elemento
 * @param {boolean} show - Mostrar ou esconder
 */
const toggleElement = (elementId, show = true) => {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = show ? "inline-block" : "none";
    }
};

/**
 * Define múltiplos elementos como readonly.
 * @param {Array<string>} elementIds - IDs dos elementos
 * @param {boolean} readonly - Readonly ou não
 */
const setReadonly = (elementIds, readonly = true) => {
    elementIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.readOnly = readonly;
    });
};

/**
 * Cria um elemento <tr> a partir de conteúdo HTML.
 * @param {string} html - Conteúdo HTML da linha
 * @returns {HTMLTableRowElement} Elemento <tr>
 */
const createTableRow = (html) => {
    const tr = document.createElement("tr");
    tr.innerHTML = html;
    return tr;
};

// ── Validação ──

/**
 * Valida se todos os campos de um objeto estão preenchidos.
 * @param {Object} data - Objeto com dados a validar
 * @returns {boolean} True se todos os campos estão preenchidos
 */
const isAllFieldsFilled = (data) => 
    Object.values(data).every(value => value && String(value).trim() !== '');

/**
 * Determina o status de estoque baseado na data de saída.
 * @param {string} dateOut - Data de saída
 * @returns {string} Status (IN_STOCK ou OUT_STOCK)
 */
const getStatusFromDate = (dateOut) => 
    (dateOut == null || dateOut === "") ? "IN_STOCK" : "OUT_STOCK";

// ── API ──

/**
 * Realiza uma requisição fetch com tratamento de erro.
 * @param {string} url - URL da requisição
 * @param {Object} options - Opções do fetch
 * @returns {Promise<Object|null>} Dados da resposta ou null se vazia
 */
const apiCall = async (url, options = {}) => {
    // Injeta o token de sessão em toda requisição à API (exceto rotas /auth que não precisam).
    // Mesmo que o overlay seja removido manualmente, o backend rejeita chamadas sem token válido.
    const token = localStorage.getItem('wcm.auth.token');
    if (token) {
        options.headers = Object.assign({ 'x-auth-token': token }, options.headers || {});
    }

    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        if (response.status === 204) {
            return null;
        }

        const contentLength = response.headers.get('content-length');
        if (!contentLength || contentLength === '0') {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`Erro na requisição ${url}:`, error.message);
        throw error;
    }
};
