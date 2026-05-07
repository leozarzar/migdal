const API = "http://localhost:3001";

loadBags();

async function saveBag() {

    const data = {
        code: document.getElementById("code").value,
        material: document.getElementById("material").value,
        supplier: document.getElementById("supplier").value,
        weight: parseFloat(document.getElementById("weight").value),
        date_in: document.getElementById("date_in").value,
        date_out: document.getElementById("date_out").value,
        status:  (document.getElementById("date_out").value == null || document.getElementById("date_out").value == "") ? "IN_STOCK" : "OUT_STOCK",
        notes: document.getElementById("notes").value
    };

    await fetch(API + "/bags", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    }).then(()=>{
        loadBags();
    });

    alert("Salvo");
}

async function loadBags() {

    const res = await fetch(API + "/bags");

    const bags = await res.json();

    const search = document.getElementById("search").value.toLowerCase();
    const status =  document.getElementById("filterStatus").value == "Em estoque" ? "IN_STOCK" :
                    document.getElementById("filterStatus").value == "Usado" ? "OUT_STOCK" : 
                    document.getElementById("filterStatus").value;
    const material = document.getElementById("filterMaterial").value;
    const supplier = document.getElementById("filterSupplier").value;

    const tbody = document.getElementById("tableBody");

    tbody.innerHTML = "";

    const now = new Date();

    fillSelects(bags);

    const filtered = bags.reverse().filter(b => {

        if (status && b.status !== status) return false;

        if (material && b.material !== material) return false;

        if (supplier && b.supplier !== supplier) return false;

        if (search) {

            const text =
                (b.code ?? "") +
                (b.material ?? "") +
                (b.supplier ?? "") +
                (b.notes ?? "");

            if (!text.toLowerCase().includes(search)) return false;
        }

        return true;

    });

    filtered.forEach(b => {

        const tr = document.createElement("tr");

        const datein = new Date(b.date_in);
        const dateout = new Date(b.date_out);

        const lt = b.date_out == null || b.date_out == "" ? Math.floor((now - datein) / (1000 * 60 * 60 * 24)) : Math.floor((dateout - datein) / (1000 * 60 * 60 * 24));

        tr.innerHTML = `
            <td class="col-status">${b.status === "IN_STOCK"
                    ? ""
                    : `<span class="material-symbols-outlined">check_circle</span>`
                }
            </td>
            <td class="col-code">${b.code}</td>
            <td class="col-material">${b.material}</td>
            <td class="col-supplier">${b.supplier}</td>
            <td class="col-qty">${b.weight}</td>
            <td class="col-wait">${lt + "d"}</td>
            <td class="col-obs">${b.notes}</td>
            <td class="col-actions">
                ${b.status === "IN_STOCK"
                    ?   `<button onclick="useBag(event,'${b.code}')">
                            <span class="material-symbols-outlined">output</span>
                        </button>`
                    :   `<button onclick="returnBag(event,'${b.code}')">
                            <span class="material-symbols-outlined">undo</span>
                        </button>`
                }
                <button onclick="deleteBag(event,'${b.code}')">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </td>
        `;

        tr.onclick = () => selectBag(b,tr);

        tbody.appendChild(tr);
    });
}

async function useBag(event,code) {

    event.stopPropagation();

    await fetch(`http://localhost:3001/bags/${code}/out`, {
        method: "PUT"
    });

    loadBags();
}

async function returnBag(event,code) {

    event.stopPropagation();

    await fetch(`http://localhost:3001/bags/${code}/in`, {
        method: "PUT"
    });

    loadBags();
}

async function deleteBag(event,code) {

    event.stopPropagation();

    await fetch(`http://localhost:3001/bags/${code}`, {
        method: "DELETE"
    });

    loadBags();
}

function fillSelects(bags) {

    const mat = new Set();
    const sup = new Set();

    bags.forEach(b => {

        if (b.material) mat.add(b.material);
        if (b.supplier) sup.add(b.supplier);

    });

    const matSelect = document.getElementById("filterMaterial");
    const supSelect = document.getElementById("filterSupplier");

    const currentMat = matSelect.value;
    const currentSup = supSelect.value;

    matSelect.innerHTML = `<option value="">Material</option>`;
    supSelect.innerHTML = `<option value="">Fornecedor</option>`;

    mat.forEach(m => {
        matSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });

    sup.forEach(s => {
        supSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });

    matSelect.value = currentMat;
    supSelect.value = currentSup;

}

function selectBag(bag,tr) {

    document.getElementById("code").value = bag.code;
    document.getElementById("material").value = bag.material;
    document.getElementById("supplier").value = bag.supplier;
    document.getElementById("weight").value = bag.weight;
    document.getElementById("date_in").value = bag.date_in;
    document.getElementById("date_out").value = bag.date_out;
    document.getElementById("notes").value = bag.notes;

    document.querySelectorAll("tr").forEach(tr => {
        tr.classList.remove("selected");
    });

    tr.classList.add("selected");

    document.getElementById("saveBtn").textContent = "Editar";
    document.getElementById("saveBtn").onclick = () => editBag();
    document.getElementById("cancelBtn").style.display = "inline-block";
}

function cancelEdit() {

    document.getElementById("code").value = "";
    document.getElementById("material").value = "";
    document.getElementById("supplier").value = "";
    document.getElementById("weight").value = "";
    document.getElementById("date_in").value = "";
    document.getElementById("date_out").value = "";
    document.getElementById("notes").value = "";

    document.querySelectorAll("tr").forEach(tr => {
        tr.classList.remove("selected");
    });

    document.getElementById("saveBtn").textContent = "Salvar";
    document.getElementById("cancelBtn").style.display = "none";
}

async function editBag() {

    const data = {
        code: document.getElementById("code").value,
        material: document.getElementById("material").value,
        supplier: document.getElementById("supplier").value,
        weight: parseFloat(document.getElementById("weight").value),
        date_in: document.getElementById("date_in").value,
        date_out: document.getElementById("date_out").value,
        status:  (document.getElementById("date_out").value == null || document.getElementById("date_out").value == "") ? "IN_STOCK" : "OUT_STOCK",
        notes: document.getElementById("notes").value
    };

    await fetch(API + `/bags/update`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    }).then(()=>{

        document.getElementById("code").value = "";
        document.getElementById("material").value = "";
        document.getElementById("supplier").value = "";
        document.getElementById("weight").value = "";
        document.getElementById("date_in").value = "";
        document.getElementById("date_out").value = "";
        document.getElementById("notes").value = "";

        document.querySelectorAll("tr").forEach(tr => {
            tr.classList.remove("selected");
        });

        document.getElementById("saveBtn").textContent = "Salvar";
        document.getElementById("cancelBtn").style.display = "none";
        loadBags();
    });

    alert("Salvo");
}