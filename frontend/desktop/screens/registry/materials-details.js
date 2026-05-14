/**
 * materials-details.js
 * Tela de detalhes de Material — criação, edição e gerenciamento de embalagens.
 */
const MaterialsDetails = {

    // ── Estado ──

    _materialId: null,
    _isDirty: false,
    _packagings: [],
    _pendingPackagings: [],
    _removedPackagingIds: [],
    _bypassLeaveCheck: false,
    _editingPkgIndex: null,
    _selectedColor: null,

    /** Cache de grupos para exibição do meta no header */
    _groupsCache: [],

    _COLOR_PALETTE: [
        '#000000', '#6b7280', '#ffffff',
        '#dc2626', '#fca5a5',
        '#ea580c', '#fdba74',
        '#d97706', '#fbbf24',
        '#16a34a', '#4ade80',
        '#0891b2', '#22d3ee',
        '#2563eb', '#60a5fa',
        '#4f46e5', '#818cf8',
        '#7c3aed', '#a78bfa',
        '#9333ea', '#e879f9',
        '#e11d48', '#f472b6',
    ],

    // ── Instâncias de componentes ──

    _groupSelect: null,
    _unitSelect: null,
    _trackingSelect: null,
    _packagingsDialog: null,
    _packagingsDataTable: null,

    // ── Helpers ──

    _isReadOnly() {
        if (!Materials.selectedMaterial) return false;
        return !hasPermission('registry', 'materials', 'edit');
    },

    // ── Ciclo de Vida ──

    async render() {
        this._groupSelect?.destroy();           this._groupSelect = null;
        this._unitSelect?.destroy();            this._unitSelect = null;
        this._trackingSelect?.destroy();        this._trackingSelect = null;
        this._packagingsDialog?.destroy();      this._packagingsDialog = null;
        this._packagingsDataTable?.destroy();   this._packagingsDataTable = null;

        return `
        <div class="materials-details-container">
            <div class="rd-content">
                <div class="rd-header">
                    <h1 id="mdTitle">Novo Material</h1>
                    <div class="rd-meta">
                        <span id="mdMetaGroup" style="display:none">Grupo: <span id="mdGroupLabel"></span>  |  </span>
                        <span>Unidade: <span id="mdUnitLabel">—</span></span>
                        <span>  |  Rastreio: <span id="mdTrackingLabel">Simples</span></span>
                    </div>
                </div>

                <div class="rd-separator"></div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Informações Básicas</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Nome <span class="required">*</span></span>
                            <span class="rd-field-desc">Identificação do material</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="mdNameMount"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Cor</span>
                            <span class="rd-field-desc">Cor de identificação visual</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="mdColorPicker"></div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Grupo</span>
                            <span class="rd-field-desc">Categoria do material</span>
                        </div>
                        <div class="rd-form-field">
                            <div class="select-with-btn">
                                <div id="mdGroupContainer"></div>
                                <button class="btn-open-tab" onclick="openNewTab('groups')" title="Abrir cadastro de grupos em nova aba">
                                    <span class="material-symbols-outlined">open_in_new</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Unidade de Medida</span>
                            <span class="rd-field-desc">Unidade usada nas movimentações</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="mdUnitContainer"></div>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Configuração de Rastreio</h2>
                    <div class="rd-form-row">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Tipo de Rastreio</span>
                            <span class="rd-field-desc">Como o estoque é controlado</span>
                        </div>
                        <div class="rd-form-field">
                            <div id="mdTrackingContainer"></div>
                        </div>
                    </div>
                    <div class="rd-form-row" id="mdPartialRow" style="display:none">
                        <div class="rd-form-label">
                            <span class="rd-field-name">Saídas Parciais</span>
                            <span class="rd-field-desc">Permite baixar parte de um lote</span>
                        </div>
                        <div class="rd-form-field">
                            <label class="mdt-option-card" for="mdAllowPartial">
                                    <i data-lucide="chart-pie" class="mdt-option-card-icon"></i>
                                <div class="mdt-option-card-body">
                                    <span class="mdt-option-card-title">Permitir saídas parciais</span>
                                    <span class="mdt-option-card-desc">Baixas de quantidade parcial do lote</span>
                                </div>
                                <span class="mdt-option-card-radio"></span>
                                <input type="checkbox" id="mdAllowPartial" style="display:none">
                            </label>
                        </div>
                    </div>
                </div>

                <div class="rd-section">
                    <h2 class="rd-section-title">Embalagens</h2>
                    <div id="mdPackagingsWidget"></div>
                </div>
            </div>

            <div class="rd-action-bar" id="mdActionBar"></div>
        </div>
        `;
    },

    _markDirty() { this._isDirty = true; },

    async canLeave() {
        if (this._bypassLeaveCheck) { this._bypassLeaveCheck = false; return true; }
        if (!this._isDirty) return true;
        return new Promise(resolve => {
            let resolved = false;
            const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
            const dlg = createDialog({
                title: 'Alterações não salvas',
                bodyHTML: '<p>Você tem alterações não salvas. O que deseja fazer?</p>',
                closeOnBackdrop: false,
                actions: [
                    { label: 'Sair sem salvar', variant: 'cancel', onClick: () => { done(true); dlg.close(); } },
                    { label: 'Continuar editando', variant: 'secondary', onClick: () => { done(false); dlg.close(); } },
                ],
                onClose: () => done(false),
            });
            dlg.open();
        });
    },

    async load() {
        this._isDirty = false;
        this._materialId = null;
        this._packagings = [];
        this._pendingPackagings = [];
        this._removedPackagingIds = [];
        this._editingPkgIndex = null;
        this._groupsCache = [];
        this._selectedColor = null;

        // Lucide icons (option card)
        const partialRow = document.getElementById('mdPartialRow');
        if (partialRow && typeof lucide !== 'undefined') lucide.createIcons({ nameAttr: 'data-lucide', rootNode: partialRow });

        // Nome
        const nameMount = document.getElementById('mdNameMount');
        if (nameMount) {
            const cmp = createInput({ id: 'mdName', placeholder: 'Nome do material' });
            nameMount.appendChild(cmp.el);
        }

        // Cor
        // (renderizado após carregar dados do material)

        // Grupo
        this._groupSelect = createSelect({
            placeholder: 'Sem grupo',
            searchable: true,
            sections: [{ key: 'group', items: [] }],
            onChange: () => { this._updateMeta(); this._markDirty(); },
        });
        this._groupSelect.mount(document.getElementById('mdGroupContainer'));

        // Unidade
        this._unitSelect = createSelect({
            placeholder: 'Selecione a unidade',
            searchable: false,
            sections: [{
                key: 'unit',
                items: [
                    { value: 'kg',       label: 'kg' },
                    { value: 'g',        label: 'g' },
                    { value: 'uni',      label: 'uni' },
                    { value: 'peça',     label: 'peça' },
                    { value: 'pacote',   label: 'pacote' },
                    { value: 'milheiro', label: 'milheiro' },
                ],
            }],
            onChange: () => { this._updateMeta(); this._markDirty(); },
        });
        this._unitSelect.mount(document.getElementById('mdUnitContainer'));
        this._unitSelect.setValue('kg');

        // Rastreio
        this._trackingSelect = createSelect({
            placeholder: 'Tipo de rastreio',
            searchable: false,
            sections: [{
                key: 'tracking',
                items: [
                    { value: 'simple', label: 'Simples' },
                    { value: 'lots',   label: 'Lotes' },
                ],
            }],
            onChange: () => { this._onTrackingChange(); this._markDirty(); },
        });
        this._trackingSelect.mount(document.getElementById('mdTrackingContainer'));
        this._trackingSelect.setValue('simple');

        // Carrega grupos
        try {
            const groups = await apiCall(API + '/groups').catch(() => []);
            this._groupsCache = groups || [];
            this._groupSelect.setItems('group', this._groupsCache.map(g => ({ value: g.id, label: g.name })));
        } catch { /* silencioso */ }

        // Edição: carrega dados do material
        if (Materials.selectedMaterial) {
            this._materialId = Materials.selectedMaterial.id;
            try {
                const mat = await apiCall(API + `/materials/${this._materialId}`);
                document.getElementById('mdTitle').textContent = mat.name;
                document.getElementById('mdName').value = mat.name;
                if (mat.group_id) this._groupSelect.setValue(mat.group_id);
                this._unitSelect.setValue(mat.unit_of_measure || 'kg');
                this._trackingSelect.setValue(mat.tracking_mode || 'simple');
                document.getElementById('mdAllowPartial').checked = !!mat.allow_partial_exit;
                this._selectedColor = this._COLOR_PALETTE.includes(mat.color) ? mat.color : null;
                this._packagings = mat.packagings || [];
            } catch {
                const dlg = createDialog({
                    title: 'Erro',
                    bodyHTML: '<p>Não foi possível carregar os dados do material.</p>',
                    actions: [{ label: 'OK', variant: 'primary', onClick: () => dlg.close() }],
                });
                dlg.open();
            }
        }

        this._onTrackingChange();
        this._updateMeta();
        this._renderColorPicker({ scrollToSelected: true });
        this._renderPackagingsWidget();
        this._renderActionBar();

        if (this._isReadOnly()) {
            this._groupSelect?.setDisabled(true);
            this._unitSelect?.setDisabled(true);
            this._trackingSelect?.setDisabled(true);
            document.querySelectorAll('.materials-details-container input')
                .forEach(el => { el.disabled = true; });
        } else {
            document.getElementById('mdAllowPartial')?.addEventListener('change', () => this._markDirty());
            document.getElementById('mdName')?.addEventListener('input', () => this._markDirty());
        }
    },

    async onTabFocus() {
        try {
            const groups = await apiCall(API + '/groups').catch(() => []);
            this._groupsCache = groups || [];
            this._groupSelect?.setItems('group', this._groupsCache.map(g => ({ value: g.id, label: g.name })));
        } catch { /* silencioso */ }
    },

    // ── Renderização ──

    _renderActionBar() {
        const bar = document.getElementById('mdActionBar');
        if (!bar) return;
        bar.innerHTML = '';
        const inner = document.createElement('div');
        inner.className = 'rd-action-bar-inner';

        const canEdit = !this._isReadOnly() && hasPermission('registry', 'materials', Materials.selectedMaterial ? 'edit' : 'create');

        if (canEdit) {
            const cancelBtn = createButton({
                label: 'Cancelar',
                variant: 'secondary',
                onClick: () => showScreen('materials'),
            });
            inner.appendChild(cancelBtn.el);

            const saveBtn = createButton({
                label: 'Salvar',
                variant: 'primary',
                icon: 'check',
                onClick: () => MaterialsDetails.save(),
            });
            inner.appendChild(saveBtn.el);
        } else {
            const backBtn = createButton({
                label: 'Voltar',
                variant: 'secondary',
                onClick: () => showScreen('materials'),
            });
            inner.appendChild(backBtn.el);
        }

        bar.appendChild(inner);
    },

    _updateMeta() {
        const groupId = this._groupSelect?.getValue();
        const group = groupId != null ? this._groupsCache.find(g => String(g.id) === String(groupId)) : null;
        const groupSpan = document.getElementById('mdMetaGroup');
        const groupLabel = document.getElementById('mdGroupLabel');
        if (groupSpan && groupLabel) {
            if (group) {
                groupLabel.textContent = group.name;
                groupSpan.style.display = '';
            } else {
                groupSpan.style.display = 'none';
            }
        }

        const unitVal = this._unitSelect?.getValue();
        const unitLabel = document.getElementById('mdUnitLabel');
        if (unitLabel) unitLabel.textContent = unitVal || '—';

        const trackingVal = this._trackingSelect?.getValue();
        const trackingLabel = document.getElementById('mdTrackingLabel');
        if (trackingLabel) trackingLabel.textContent = trackingVal === 'lots' ? 'Lotes' : 'Simples';
    },

    _onTrackingChange() {
        const val = this._trackingSelect?.getValue();
        const row = document.getElementById('mdPartialRow');
        if (row) row.style.display = val === 'lots' ? '' : 'none';
        if (val !== 'lots') {
            const el = document.getElementById('mdAllowPartial');
            if (el) el.checked = false;
        }
        this._updateMeta();
    },

    _renderColorPicker({ scrollToSelected = false } = {}) {
        const container = document.getElementById('mdColorPicker');
        if (!container) return;

        const existing = container.querySelector('.mdt-color-picker');
        const savedScroll = existing ? existing.scrollLeft : 0;

        container.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'mdt-color-picker';

        wrap.appendChild(this._makeColorSwatch(null));
        for (const color of this._COLOR_PALETTE) {
            wrap.appendChild(this._makeColorSwatch(color));
        }

        container.appendChild(wrap);

        if (scrollToSelected && this._selectedColor !== null) {
            const selected = wrap.querySelector('.mdt-color-swatch--selected');
            if (selected) {
                wrap.scrollLeft = selected.offsetLeft - wrap.clientWidth / 2 + selected.offsetWidth / 2;
            }
        } else {
            wrap.scrollLeft = savedScroll;
        }
    },

    _makeColorSwatch(color) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mdt-color-swatch' + (color === null ? ' mdt-color-swatch--none' : '') + (color === '#ffffff' ? ' mdt-color-swatch--white' : '');
        if (color) btn.style.background = color;
        if (this._isReadOnly()) btn.disabled = true;

        if (this._selectedColor === color && color !== null) {
            btn.classList.add('mdt-color-swatch--selected');
            const check = document.createElement('span');
            check.className = 'material-symbols-outlined mdt-color-check';
            check.textContent = 'check';
            btn.appendChild(check);
        } else if (this._selectedColor === color && color === null) {
            btn.classList.add('mdt-color-swatch--selected');
        }

        btn.onclick = () => {
            this._selectedColor = color;
            this._markDirty();
            this._renderColorPicker();
        };        return btn;
    },

    _renderPackagingsWidget() {
        const widget = document.getElementById('mdPackagingsWidget');
        if (!widget) return;
        widget.innerHTML = '';

        const all = [...this._packagings, ...this._pendingPackagings];
        const readOnly = this._isReadOnly();

        if (all.length === 0) {
            if (readOnly) {
                const p = document.createElement('p');
                p.className = 'rd-items-empty';
                p.textContent = 'Nenhuma embalagem cadastrada.';
                widget.appendChild(p);
            } else {
                const btn = document.createElement('button');
                btn.className = 'rd-items-dashed-btn';
                btn.innerHTML = '<span class="material-symbols-outlined">add</span> Adicionar Embalagem';
                btn.onclick = () => MaterialsDetails.openPackagingsDialog();
                widget.appendChild(btn);
                if (typeof lucide !== 'undefined') lucide.createIcons({ nameAttr: 'data-lucide', rootNode: btn });
            }
        } else {
            const summary = document.createElement('div');
            summary.className = 'rd-items-summary' + (readOnly ? '' : ' rd-items-summary--clickable');
            if (!readOnly) summary.onclick = () => MaterialsDetails.openPackagingsDialog();

            const names = all.slice(0, 3).map(p => _esc(p.name)).join(', ');
            const more = all.length > 3 ? ` +${all.length - 3}` : '';

            summary.innerHTML = `
                <div class="rd-items-summary-left">
                    <i data-lucide="package-open" class="rd-items-summary-icon rd-items-summary-icon--left"></i>
                    <div class="rd-items-summary-info">
                        <span class="rd-items-summary-count">${all.length} embalagem${all.length !== 1 ? 's' : ''}</span>
                        <span class="rd-items-summary-materials">${names}${more}</span>
                    </div>
                </div>
                ${!readOnly ? '<i data-lucide="pencil-line" class="rd-items-summary-icon"></i>' : ''}
            `;
            widget.appendChild(summary);
            if (typeof lucide !== 'undefined') lucide.createIcons({ nameAttr: 'data-lucide', rootNode: summary });
        }
    },

    openPackagingsDialog() {
        this._editingPkgIndex = null;
        this._packagingsDataTable?.destroy(); this._packagingsDataTable = null;
        this._packagingsDialog?.destroy();    this._packagingsDialog = null;

        this._packagingsDialog = createDialog({
            title: 'Embalagens',
            wide: true,
            bodyHTML: `
                <div class="rd-items-dlg-body">
                    <div class="rd-items-dlg-form">
                        <div class="rd-items-dlg-fields">
                            <div style="flex:1">
                                <span class="rd-dlg-field-label">Nome <span class="required">*</span></span>
                                <div id="mdPkgNameMount"></div>
                            </div>
                            <div style="max-width:140px">
                                <span class="rd-dlg-field-label">Quantidade</span>
                                <div id="mdPkgQtyMount"></div>
                            </div>
                        </div>
                        <div class="rd-items-dlg-actions" id="mdPkgDlgActions"></div>
                    </div>
                    <hr class="rd-items-dlg-divider">
                    <div id="mdPkgTableMount"></div>
                </div>
            `,
            actions: [
                { label: 'Fechar', variant: 'secondary', onClick: () => this._packagingsDialog?.close() },
            ],
            onClose: () => {
                this._packagingsDataTable?.destroy(); this._packagingsDataTable = null;
                const dlg = this._packagingsDialog; this._packagingsDialog = null;
                dlg?.destroy();
                this._renderPackagingsWidget();
            },
        });
        this._packagingsDialog.open();

        const backdrops = document.querySelectorAll('.dialog-backdrop');
        backdrops[backdrops.length - 1]?.querySelector('.dialog-panel')?.classList.add('dialog-panel--items-dlg');

        this._packagingsDataTable = createDataTable({
            columns: [
                { key: 'name',     header: 'Nome',       render: r => _esc(r.name) },
                { key: 'quantity', header: 'Quantidade',  width: '140px', render: r => r.quantity != null ? String(r.quantity) : '—' },
            ],
            getRowKey: r => `${r._type}-${r._index}`,
            emptyMessage: 'Nenhuma embalagem cadastrada.',
            emptyIcon: 'inventory_2',
            actions: [{
                label: 'Remover',
                icon: 'delete',
                variant: 'destructive',
                onClick: r => MaterialsDetails._removePkg(r._type, r._index),
            }],
        });
        this._packagingsDataTable.mount(document.getElementById('mdPkgTableMount'));
        this._refreshPkgTable();

        const nameInput = createInput({ id: 'mdPkgName', placeholder: 'Nome da embalagem' });
        nameInput.input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); MaterialsDetails._confirmPkg(); }
        });
        document.getElementById('mdPkgNameMount').appendChild(nameInput.el);

        const qtyInput = createInput({ id: 'mdPkgQty', type: 'number', placeholder: 'Qtd.' });
        qtyInput.input.step = 'any'; qtyInput.input.min = '0';
        qtyInput.input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); MaterialsDetails._confirmPkg(); }
        });
        document.getElementById('mdPkgQtyMount').appendChild(qtyInput.el);

        this._renderPkgFormActions();
    },

    _renderPkgFormActions() {
        const container = document.getElementById('mdPkgDlgActions');
        if (!container) return;
        container.innerHTML = '';

        const addBtn = createButton({
            label: 'Adicionar',
            variant: 'primary',
            icon: 'add',
            onClick: () => MaterialsDetails._confirmPkg(),
        });
        container.appendChild(addBtn.el);
    },

    _refreshPkgTable() {
        if (!this._packagingsDataTable) return;
        const rows = [
            ...this._packagings.map((p, i) => ({ ...p, _type: 'saved', _index: i })),
            ...this._pendingPackagings.map((p, i) => ({ ...p, _type: 'pending', _index: i })),
        ];
        this._packagingsDataTable.setData(rows);
    },

    _confirmPkg() {
        const nameEl = document.getElementById('mdPkgName');
        const qtyEl  = document.getElementById('mdPkgQty');
        const name = nameEl?.value.trim();
        if (!name) { nameEl?.focus(); return; }
        const quantity = parseFloat(qtyEl?.value) || null;
        this._pendingPackagings.push({ name, quantity });
        this._markDirty();
        if (nameEl) nameEl.value = '';
        if (qtyEl)  qtyEl.value  = '';
        this._refreshPkgTable();
        nameEl?.focus();
    },

    _removePkg(type, index) {
        if (type === 'saved') {
            const pkg = this._packagings[index];
            if (pkg) this._removedPackagingIds.push(pkg.id);
            this._packagings.splice(index, 1);
        } else {
            this._pendingPackagings.splice(index, 1);
        }
        this._markDirty();
        this._refreshPkgTable();
    },

    // ── Ações ──

    async save() {
        const name = document.getElementById('mdName')?.value.trim();
        if (!name) {
            const dlg = createDialog({
                title: 'Campo obrigatório',
                bodyHTML: '<p>Digite o nome do material.</p>',
                actions: [{ label: 'OK', variant: 'primary', onClick: () => { dlg.close(); document.getElementById('mdName')?.focus(); } }],
            });
            dlg.open();
            return;
        }

        const groupVal = this._groupSelect?.getValue();
        const payload = {
            name,
            color:              this._selectedColor,
            group_id:           groupVal != null ? parseInt(groupVal) : null,
            unit_of_measure:    this._unitSelect?.getValue() || 'kg',
            tracking_mode:      this._trackingSelect?.getValue() || 'simple',
            allow_partial_exit: document.getElementById('mdAllowPartial')?.checked ? 1 : 0,
        };

        try {
            let materialId = this._materialId;

            if (materialId) {
                await apiCall(API + `/materials/${materialId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                const locationId = Materials._getActiveLocationId();
                if (!window.AppUser?.isAdmin && !locationId) {
                    const dlg = createDialog({
                        title: 'Localização necessária',
                        bodyHTML: '<p>Selecione uma localização na barra lateral antes de cadastrar.</p>',
                        actions: [{ label: 'OK', variant: 'primary', onClick: () => dlg.close() }],
                    });
                    dlg.open();
                    return;
                }

                try {
                    const result = await apiCall(API + '/materials', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...payload, location_id: locationId }),
                    });
                    materialId = result.id;
                } catch (error) {
                    if (error.status === 409 && error.data?.conflict) {
                        this._handleConflict(error.data.existing, locationId);
                        return;
                    }
                    throw error;
                }
            }

            for (const pkgId of this._removedPackagingIds) {
                await apiCall(API + `/materials/${materialId}/packagings/${pkgId}`, { method: 'DELETE' });
            }
            for (const pkg of this._pendingPackagings) {
                await apiCall(API + `/materials/${materialId}/packagings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: pkg.name, quantity: pkg.quantity }),
                });
            }

            this._isDirty = false;
            showToast('Material salvo com sucesso', 'success');
            showScreen('materials');
        } catch (error) {
            const dlg = createDialog({
                title: 'Erro ao salvar',
                bodyHTML: `<p>${_esc(error.message || 'Ocorreu um erro ao salvar o material.')}</p>`,
                actions: [{ label: 'OK', variant: 'primary', onClick: () => dlg.close() }],
            });
            dlg.open();
        }
    },

    _handleConflict(existing, locationId) {
        const uom = existing.unit_of_measure || 'kg';
        const colorDot = existing.color
            ? `<span class="materials-color-swatch" style="background:${existing.color}"></span>`
            : '';

        const dlg = createDialog({
            title: 'Material já existe',
            subtitle: 'Um material com esse nome já existe no catálogo global. Deseja vinculá-lo à sua localização?',
            bodyHTML: `
                <div class="mdt-conflict-info">
                    <p>${colorDot}<strong>${_esc(existing.name)}</strong></p>
                    <p>Unidade: ${_esc(uom)}</p>
                    <p>Rastreio: ${existing.tracking_mode === 'lots' ? 'Lotes' : 'Simples'}</p>
                </div>
            `,
            actions: [
                {
                    label: 'Vincular à minha localização',
                    variant: 'primary',
                    onClick: async () => {
                        try {
                            await apiCall(API + `/materials/${existing.id}/link`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ location_id: locationId }),
                            });
                            dlg.close();
                            dlg.destroy();
                            this._isDirty = false;
                            showToast('Material vinculado com sucesso', 'success');
                            showScreen('materials');
                        } catch (e) {
                            const errDlg = createDialog({
                                title: 'Erro',
                                bodyHTML: `<p>${_esc(e.message || 'Erro ao vincular material.')}</p>`,
                                actions: [{ label: 'OK', variant: 'primary', onClick: () => errDlg.close() }],
                            });
                            errDlg.open();
                        }
                    },
                },
                { label: 'Cancelar', variant: 'secondary', onClick: () => { dlg.close(); dlg.destroy(); } },
            ],
        });
        dlg.open();
    },
};
