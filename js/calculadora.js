// =========================================================
// ESTAT GLOBAL I CONFIGURACIÓ
// =========================================================
let reduccioActiva = false;
let estacioActual = 'Anual'; 
let recursosChartInstancia = null;
let economicChartInstancia = null;

// Mesos del curs segons l'estratègia de Cicles Estacionals
const CONFIG_ESTACIONS = {
    'Anual': ['Set', 'Oct', 'Nov', 'Des', 'Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'],
    'Primavera': ['Mar', 'Abr', 'Mai'],
    'Estiu': ['Jun', 'Jul', 'Ago'],
    'Tardor': ['Set', 'Oct', 'Nov'],
    'Hivern': ['Des', 'Gen', 'Feb']
};

document.addEventListener("DOMContentLoaded", inicializarDadesReals);

// =========================================================
// 1. HIDRATACIÓ DES DE DATACLEAN.JSON
// =========================================================
async function inicializarDadesReals() {
    const inputs = document.querySelectorAll('.inputs input');
    try {
        inputs.forEach(input => input.style.opacity = '0.4');

        const response = await fetch('./dataclean.json');
        if (!response.ok) throw new Error('Error carregant JSON');
        
        const data = await response.json();
        const factures = data.dades_recollides.factures_compres_i_manteniment;
        const aiguaAnomal = data.dades_recollides.consum_aigua_anomal;

        // Càlcul Aigua (IND-01): Mitjana de pèrdua hídrica fora d'horari
        const mitjanaHídrica = aiguaAnomal.reduce((acc, curr) => acc + curr.litres_consumits, 0) / aiguaAnomal.length;
        // Projecció: Mitjana * 10h tancament * 30 dies
        document.getElementById('aigua').value = Math.round(mitjanaHídrica * 10 * 30);

        // Mitjanes mensuals de factures (Material Oficina i Neteja)
        const totalOficina = factures.filter(f => f.categoria === "Material Oficina").reduce((sum, f) => sum + f.import_total_eur, 0);
        const totalNeteja = factures.filter(f => f.categoria === "Neteja i Consumibles").reduce((sum, f) => sum + f.import_total_eur, 0);

        document.getElementById('oficina').value = (totalOficina / 3).toFixed(2);
        document.getElementById('neteja').value = (totalNeteja / 3).toFixed(2);

        inputs.forEach(input => {
            input.style.transition = 'all 0.4s ease';
            input.style.opacity = '1';
        });

    } catch (error) {
        console.warn(">_ [ASG_WARN] Mode offline.", error);
        inputs.forEach(input => input.style.opacity = '1');
    }
}

// =========================================================
// 2. CONTROLADOR DEL SELECTOR ESTACIONAL
// =========================================================
function setEstacio(nomEstacio, btn) {
    estacioActual = nomEstacio;
    
    // UI: Activar botó visualment (Feedback immediat de selecció)
    document.querySelectorAll('.btn-estacio').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // HEM ELIMINAT LA LÍNIA 'calcular();' 
    // Ara l'usuari ha de clicar el botó "Executar" per veure els resultats.
}

// =========================================================
// 3. MOTOR DE CÀLCUL (8 INDICADORS + TENDÈNCIES) 
// =========================================================
function calcular() {
    const base = {
        elec: parseFloat(document.getElementById('elec').value) || 0,
        aigua: parseFloat(document.getElementById('aigua').value) || 0,
        ofi: parseFloat(document.getElementById('oficina').value) || 0,
        neteja: parseFloat(document.getElementById('neteja').value) || 0
    };

    const factor = reduccioActiva ? 0.7 : 1.0; 
    const mesosAFiltrar = CONFIG_ESTACIONS[estacioActual];
    
    let t = { elec: 0, aigua: 0, ofi: 0, neteja: 0, elecL: 0, aiguaL: 0, ofiL: 0, netejaL: 0 };

    mesosAFiltrar.forEach(mes => {
        let m = { e: 1.0, a: 1.0, o: 1.0, n: 1.0 };
        const variabilitat = 1 + (Math.random() * 0.06 - 0.03); // Variabilitat mensual (+/- 3%)

        // Aplicació de Cicles Estacionals i Tendències
        if (['Des', 'Gen', 'Feb'].includes(mes)) m.e = 1.45; // Hivern: Calefacció
        if (['Mai', 'Jun', 'Jul'].includes(mes)) { m.a = 1.35; m.e = 1.25; } // Estiu: Aigua/AACC
        if (['Set', 'Jun'].includes(mes)) { m.o = 1.6; m.n = 1.4; } // Pics activitat escolar
        if (mes === 'Ago') { m.e = 0.15; m.a = 0.1; m.o = 0.0; m.n = 0.25; } // Tancat

        const cE = base.elec * m.e * variabilitat;
        const cA = base.aigua * m.a * variabilitat;
        const cO = base.ofi * m.o * variabilitat;
        const cN = base.neteja * m.n * variabilitat;

        t.elec += cE; t.aigua += cA; t.ofi += cO; t.neteja += cN;

        // Càlculs Període Lectiu (Setembre a Juny) per a la rúbrica [cite: 5]
        if (mes !== 'Jul' && mes !== 'Ago') {
            t.elecL += cE; t.aiguaL += cA; t.ofiL += cO; t.netejaL += cN;
        }
    });

    renderitzarUI(t, factor);
}

// =========================================================
// 4. RENDERITZAT I GRÀFICS
// =========================================================
function renderitzarUI(t, f) {
    document.getElementById('resultats').classList.remove('hidden');

    // Missatge de Log Estacional (Feedback visual de tendències)
    const logInfo = document.getElementById('estacionalitat-info');
    if (logInfo) {
        logInfo.innerHTML = `
            <b>[LOG] Simulació ${estacioActual} Activa</b><br>
            <small>> Aplicant tendències: ${estacioActual === 'Hivern' ? 'Pic Calefacció' : estacioActual === 'Estiu' ? 'Pic Hídric/AACC' : 'Consums Estàndard'}</small>
        `;
    }

    // Els 8 Càlculs Requerits (Fase 3 - 3.1a) 
    document.getElementById('output-resum').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; font-size: 0.85rem;">
            <p>> Elec. Any: <b>${(t.elec * f).toFixed(0)} kWh</b></p>
            <p>> Elec. Lectiu: <b>${(t.elecL * f).toFixed(0)} kWh</b></p>
            <p>> Aigua Any: <b>${(t.aigua * f).toFixed(0)} L</b></p>
            <p>> Aigua Lectiu: <b>${(t.aiguaL * f).toFixed(0)} L</b></p>
            <p>> Oficina Any: <b>${(t.ofi * f).toFixed(2)} €</b></p>
            <p>> Oficina Lectiu: <b>${(t.ofiL * f).toFixed(2)} €</b></p>
            <p>> Neteja Any: <b>${(t.neteja * f).toFixed(2)} €</b></p>
            <p>> Neteja Lectiu: <b>${(t.netejaL * f).toFixed(2)} €</b></p>
        </div>
    `;

    // Estalvi Real (Rúbrica: Pla 3 anys)
    const estalviCont = document.getElementById('estalvi-real-container');
    if (reduccioActiva && estalviCont) {
        estalviCont.innerHTML = `
            <div class="pla-reduccio" style="margin-top:20px; border-left: 4px solid var(--eco-primary);">
                <h3 style="color:var(--eco-primary);">>_ ESTALVI REAL PROJECTAT (3 ANYS):</h3>
                <p>♻️ Aigua: <b>${(t.aigua * 0.3 * 3).toLocaleString()} L</b></p>
                <p>⚡ Energia: <b>${(t.elec * 0.3 * 3).toLocaleString()} kWh</b></p>
            </div>
        `;
    }

    renderizarGraficos(t.elec * f, t.aigua * f, t.ofi * f, t.neteja * f);
}

function aplicarMillores() {
    reduccioActiva = true;
    calcular();
}

function renderizarGraficos(elec, aigua, ofi, neteja) {
    const colorPrimario = '#00FF66';
    Chart.defaults.color = '#A3FFC2';
    Chart.defaults.font.family = "'Courier New', Courier, monospace";

    if(recursosChartInstancia) recursosChartInstancia.destroy();
    if(economicChartInstancia) economicChartInstancia.destroy();

    recursosChartInstancia = new Chart(document.getElementById('recursosChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Energia', 'Aigua'],
            datasets: [{ label: 'Consum', data: [elec, aigua], backgroundColor: 'rgba(0, 255, 102, 0.2)', borderColor: colorPrimario, borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    economicChartInstancia = new Chart(document.getElementById('economicChart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Oficina', 'Neteja'],
            datasets: [{ data: [ofi, neteja], backgroundColor: [colorPrimario, 'rgba(11, 219, 121, 0.5)'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });
}