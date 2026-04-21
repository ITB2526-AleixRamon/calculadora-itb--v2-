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
const MESOS_ANY = ['Set', 'Oct', 'Nov', 'Des', 'Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];

function executarDiagnostic() {
    reduccioActiva = false; // Reseteja la reducció al 0%
    calcular();
}

function aplicarMillores() {
    reduccioActiva = true; // Aplica el -30%
    calcular();
}

function calcular() {
    const base = {
        elec: parseFloat(document.getElementById('elec').value) || 0,
        aigua: parseFloat(document.getElementById('aigua').value) || 0,
        ofi: parseFloat(document.getElementById('oficina').value) || 0,
        neteja: parseFloat(document.getElementById('neteja').value) || 0
    };

    const factor = reduccioActiva ? 0.7 : 1.0; 
    const mesosSeleccionats = CONFIG_ESTACIONS[estacioActual]; 

    // tAny: Sumatori dels 12 mesos reals
    let tAny = { elec: 0, aigua: 0, ofi: 0, neteja: 0, co2: 0, estalviCPD: 0 };
    // tPeriode: Sumatori exclusiu del període seleccionat (o Set-Jun si és Anual)
    let tPeriode = { elec: 0, aigua: 0, ofi: 0, neteja: 0 };

    // Calculem SEMPRE els 12 mesos per tenir l'Anual correcte
    MESOS_ANY.forEach((mes, index) => {
        let m = { e: 1.0, a: 1.0, o: 1.0, n: 1.0 };
        
        // VARIABILITAT DETERMINISTA: Oscil·lació del +/- 4% basada en l'índex del mes.
        // Així complim amb afegir variabilitat, però els números mai "salten" aleatòriament.
        const variabilitat = 1 + (Math.sin(index * 12.5) * 0.04); 

        // LÓGICA DE TANCAMENTS I PICS
        if (['Des', 'Gen'].includes(mes)) { m.e = 1.25; m.a = 0.6; m.o = 0.5; }
        if (['Feb'].includes(mes)) { m.e = 1.45; } 
        if (['Abr'].includes(mes)) { m.e = 0.8; m.a = 0.7; } 
        if (['Mai', 'Jun', 'Jul'].includes(mes)) { m.a = 1.35; m.e = 1.25; } 
        if (['Set', 'Jun'].includes(mes)) { m.o = 1.6; m.n = 1.4; } 
        if (mes === 'Ago') { m.e = 0.1; m.a = 0.05; m.o = 0.0; m.n = 0.1; }

        const cE = base.elec * m.e * variabilitat;
        const cA = base.aigua * m.a * variabilitat;
        const cO = base.ofi * m.o * variabilitat;
        const cN = base.neteja * m.n * variabilitat;

        // Sumatori Anual (Tot l'any)
        tAny.elec += cE; tAny.aigua += cA; tAny.ofi += cO; tAny.neteja += cN;
        tAny.co2 += (cE * 0.25);
        tAny.estalviCPD += (cE * 0.12);

        // Sumatori Període. Si estem a "Anual", el període és el Lectiu (Sense Jul/Ago).
        // Si estem en una estació, el període són només els mesos d'aquella estació.
        const isMesEnPeriode = estacioActual === 'Anual' 
            ? (mes !== 'Jul' && mes !== 'Ago') 
            : mesosSeleccionats.includes(mes);

        if (isMesEnPeriode) {
            tPeriode.elec += cE; tPeriode.aigua += cA; tPeriode.ofi += cO; tPeriode.neteja += cN;
        }
    });

    renderitzarUI(tAny, tPeriode, factor);
}

// =========================================================
// 4. RENDERITZAT I GRÀFICS
// =========================================================
function renderitzarUI(tAny, tPeriode, f) {
    document.getElementById('resultats').classList.remove('hidden');

    // Etiqueta per saber quin període estem visualitzant
    const etiquetaPeriode = estacioActual === 'Anual' ? 'Lectiu (Set-Jun)' : `Estació (${estacioActual})`;

    const logInfo = document.getElementById('estacionalitat-info');
    if (logInfo) {
        logInfo.innerHTML = `<b>[SISTEMA] Mode ${estacioActual} Actiu</b> | <small>${reduccioActiva ? '🟢 POLÍTIQUES ASG APLICADES' : '🔴 SENSE OPTIMITZAR'}</small>`;
    }

    // 1. ELS 8 CÀLCULS REQUERITS (RESUM)
    document.getElementById('output-resum').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; font-size: 0.85rem;">
            <p>> Elec. Total Any: <b>${(tAny.elec * f).toFixed(0)} kWh</b></p>
            <p>> Elec. ${etiquetaPeriode}: <b>${(tPeriode.elec * f).toFixed(0)} kWh</b></p>
            <p>> Aigua Total Any: <b>${(tAny.aigua * f).toFixed(0)} L</b></p>
            <p>> Aigua ${etiquetaPeriode}: <b>${(tPeriode.aigua * f).toFixed(0)} L</b></p>
            <p>> Oficina Total Any: <b>${(tAny.ofi * f).toFixed(2)} €</b></p>
            <p>> Oficina ${etiquetaPeriode}: <b>${(tPeriode.ofi * f).toFixed(2)} €</b></p>
            <p>> Neteja Total Any: <b>${(tAny.neteja * f).toFixed(2)} €</b></p>
            <p>> Neteja ${etiquetaPeriode}: <b>${(tPeriode.neteja * f).toFixed(2)} €</b></p>
        </div>
    `;

    const estalviCont = document.getElementById('estalvi-real-container');
    const cronogramaCont = document.getElementById('cronograma-container');

    if (reduccioActiva) {
        // A) CÀLCULS PER A LES ANALOGIES (Basats en el període seleccionat per ser reactius)
        const estalviAigua = tPeriode.aigua * 0.3 * 3;
        const estalviElec = tPeriode.elec * 0.3 * 3;
        const estalviCO2 = (tPeriode.elec * 0.25) * 0.3 * 3;
        const estalviEcon = (tPeriode.ofi + tPeriode.neteja) * 0.3 * 3;

        const banyeres = Math.round(estalviAigua / 150) || 0; 
        const llars = Math.round(estalviElec / 250) || 0; 
        const arbres = Math.round(estalviCO2 / 25) || 0; 
        const portatils = Math.round(estalviEcon / 400) || 0;

        if (estalviCont) {
            estalviCont.innerHTML = `
                <div class="pla-reduccio" style="margin-top:20px; border-left: 4px solid var(--eco-primary);">
                    <h3 style="color:var(--eco-primary);">>_ IMPACTE QUANTIFICAT - 3 ANYS (${etiquetaPeriode.toUpperCase()}):</h3>
                    <p style="font-size:0.75rem; color:var(--eco-soft); margin-bottom: 15px; opacity:0.8;">> Fes clic per veure les equivalències:</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <details class="analogy-details">
                            <summary><span>♻️ Aigua: <b style="color:white">${estalviAigua.toLocaleString(undefined, {maximumFractionDigits:0})} L</b></span></summary>
                            <div class="analogy-content">↳ Equival a omplir <b>${banyeres.toLocaleString()} banyeres</b>.</div>
                        </details>
                        <details class="analogy-details">
                            <summary><span>⚡ Energia: <b style="color:white">${estalviElec.toLocaleString(undefined, {maximumFractionDigits:0})} kWh</b></span></summary>
                            <div class="analogy-content">↳ Es mantindrien il·luminades <b>${llars.toLocaleString()} llars</b> un mes.</div>
                        </details>
                        <details class="analogy-details">
                            <summary><span>🌍 CO2 Evitat: <b style="color:white">${estalviCO2.toLocaleString(undefined, {maximumFractionDigits:1})} kg</b></span></summary>
                            <div class="analogy-content">↳ Feina d'absorció de <b>${arbres.toLocaleString()} arbres</b>/any.</div>
                        </details>
                        <details class="analogy-details">
                            <summary><span>💶 Estalvi Econòmic: <b style="color:white">${estalviEcon.toLocaleString(undefined, {maximumFractionDigits:0})} €</b></span></summary>
                            <div class="analogy-content">↳ Es finançarien <b>${portatils} portàtils</b> nous per a l'ITB.</div>
                        </details>
                    </div>
                </div>
            `;
        }

        // B) CRONOGRAMA DINÀMIC (Basat en l'estalvi global de tot l'any per ser realista)
        if (cronogramaCont) {
            cronogramaCont.innerHTML = `
                <div class="pla-reduccio" style="margin-top: 30px;">
                    <h3>> CRONOGRAMA D'ECONOMIA CIRCULAR (3 ANYS GLOBAL):</h3>
                    <div class="timeline">
                        <div class="timeline-item">
                            <div class="timeline-year">🗓️ ANY 1: Monitoratge (Objectiu: -10%)</div>
                            <p>> <b>Acció:</b> Reparació de fuites nocturnes i Green Coding.</p>
                            <p>> <b>Indicador:</b> Reducció de <b>${(tAny.aigua * 0.1).toLocaleString(undefined, {maximumFractionDigits:0})} L</b> i <b>${(tAny.elec * 0.1).toLocaleString(undefined, {maximumFractionDigits:0})} kWh</b>.</p>
                        </div>
                        <div class="timeline-item">
                            <div class="timeline-year">🗓️ ANY 2: Circularitat (Objectiu: -20%)</div>
                            <p>> <b>Acció:</b> 'Zero Paper' i recondicionament d'equips RAEE.</p>
                            <p>> <b>Indicador:</b> Estalvi de <b>${((tAny.ofi + tAny.neteja) * 0.2).toLocaleString(undefined, {maximumFractionDigits:2})} €</b> en consumibles.</p>
                        </div>
                        <div class="timeline-item">
                            <div class="timeline-year">🗓️ ANY 3: Autoconsum (Objectiu: -30%)</div>
                            <p>> <b>Acció:</b> Ampliació planta solar i aprofitament hídric.</p>
                            <p>> <b>Indicador:</b> S'evita l'emissió de <b>${(tAny.co2 * 0.3).toLocaleString(undefined, {maximumFractionDigits:1})} kg de CO2</b>.</p>
                        </div>
                    </div>
                </div>
            `;
        }
    } else {
        // Netejar contenidors si no hi ha reducció activa
        if (estalviCont) estalviCont.innerHTML = "";
        if (cronogramaCont) cronogramaCont.innerHTML = "";
    }

    // Actualitzar els gràfics amb les dades del període seleccionat
    renderizarGraficos(tPeriode.elec * f, tPeriode.aigua * f, tPeriode.ofi * f, tPeriode.neteja * f);
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