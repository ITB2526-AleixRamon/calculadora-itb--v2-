// =========================================================
// ESTAT GLOBAL I CONFIGURACIÓ
// =========================================================
let reduccioActiva = false;
let estacioActual = 'Anual'; 
let recursosChartInstancia = null;
let economicChartInstancia = null;

const MESOS_ANY = ['Set', 'Oct', 'Nov', 'Des', 'Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];

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

        // Càlcul Aigua (IND-01)
        const mitjanaHídrica = aiguaAnomal.reduce((acc, curr) => acc + curr.litres_consumits, 0) / aiguaAnomal.length;
        document.getElementById('aigua').value = Math.round(mitjanaHídrica * 10 * 30);

        // Mitjanes mensuals de factures
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
// 2. CONTROLADOR DEL SELECTOR ESTACIONAL I BOTONS
// =========================================================
function setEstacio(nomEstacio, btn) {
    estacioActual = nomEstacio;
    document.querySelectorAll('.btn-estacio').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function executarDiagnostic() {
    reduccioActiva = false; // Desactiva el pla ASG
    calcular();
}

function aplicarMillores() {
    reduccioActiva = true; // Activa el pla ASG (-30%)
    calcular();
}

// =========================================================
// 3. MOTOR DE CÀLCUL (DETERMINISTA + EFICIÈNCIA CO2)
// =========================================================
function calcular() {
    const base = {
        elec: parseFloat(document.getElementById('elec').value) || 0,
        aigua: parseFloat(document.getElementById('aigua').value) || 0,
        ofi: parseFloat(document.getElementById('oficina').value) || 0,
        neteja: parseFloat(document.getElementById('neteja').value) || 0
    };

    const factor = reduccioActiva ? 0.7 : 1.0; 
    const mesosSeleccionats = CONFIG_ESTACIONS[estacioActual]; 

    let tAny = { elec: 0, aigua: 0, ofi: 0, neteja: 0, co2: 0, estalviCPD: 0 };
    let tPeriode = { elec: 0, aigua: 0, ofi: 0, neteja: 0 };

    MESOS_ANY.forEach((mes, index) => {
        let m = { e: 1.0, a: 1.0, o: 1.0, n: 1.0 };
        // Variabilitat fixa segons el mes perquè no salti aleatòriament
        const variabilitat = 1 + (Math.sin(index * 12.5) * 0.04); 

        // LÒGICA DE TANCAMENTS
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

        tAny.elec += cE; tAny.aigua += cA; tAny.ofi += cO; tAny.neteja += cN;
        tAny.co2 += (cE * 0.25);
        tAny.estalviCPD += (cE * 0.12);

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
// 4. RENDERITZAT I INTERFÍCIE (AMB DESPLEGABLES I MINI-GRÀFICS)
// =========================================================
function renderitzarUI(tAny, tPeriode, f) {
    document.getElementById('resultats').classList.remove('hidden');

    const etiquetaPeriode = estacioActual === 'Anual' ? 'Lectiu (Set-Jun)' : `Estació (${estacioActual})`;

    const logInfo = document.getElementById('estacionalitat-info');
    if (logInfo) {
        logInfo.innerHTML = `<b>[SISTEMA] Mode ${estacioActual} Actiu</b> | <small>${reduccioActiva ? '🟢 POLÍTIQUES ASG APLICADES' : '🔴 SENSE OPTIMITZAR'}</small>`;
    }

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
    const anticCronograma = document.getElementById('cronograma-container');
    if(anticCronograma) anticCronograma.innerHTML = "";

    if (reduccioActiva) {
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
                    <h3 style="color:var(--eco-primary);">>_ PLA D'ACCIÓ I IMPACTE (3 ANYS) - ${etiquetaPeriode.toUpperCase()}:</h3>
                    <p style="font-size:0.75rem; color:var(--eco-soft); margin-bottom: 15px; opacity:0.8;">> Fes clic a cada indicador per veure l'estratègia i la projecció:</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        
                        <details class="analogy-details">
                            <summary><span>♻️ Aigua Estalviada: <b style="color:white">${estalviAigua.toLocaleString(undefined, {maximumFractionDigits:0})} L</b></span></summary>
                            <div class="analogy-content">
                                <p style="margin-bottom:10px;">↳ Això equival a omplir <b>${banyeres.toLocaleString()} banyeres</b>.</p>
                                <div class="mini-cronograma">
                                    <p><b>Any 1:</b> Reparació fuites estructurals (193 L/h).</p>
                                    <p><b>Any 2:</b> Polsadors temporitzats a lavabos.</p>
                                    <p><b>Any 3:</b> Dipòsit de recollida pluvial per reg.</p>
                                </div>
                                <div style="height: 120px; width: 100%; margin-top:10px;"><canvas id="chartAigua"></canvas></div>
                            </div>
                        </details>

                        <details class="analogy-details">
                            <summary><span>⚡ Energia Estalviada: <b style="color:white">${estalviElec.toLocaleString(undefined, {maximumFractionDigits:0})} kWh</b></span></summary>
                            <div class="analogy-content">
                                <p style="margin-bottom:10px;">↳ Mantindria il·luminades <b>${llars.toLocaleString()} llars</b> un mes.</p>
                                <div class="mini-cronograma">
                                    <p><b>Any 1:</b> Apagat de servidors nocturn.</p>
                                    <p><b>Any 2:</b> Substitució LED i sensors presència.</p>
                                    <p><b>Any 3:</b> Nou quadre elèctric (estalvi fugues).</p>
                                </div>
                                <div style="height: 120px; width: 100%; margin-top:10px;"><canvas id="chartElec"></canvas></div>
                            </div>
                        </details>

                        <details class="analogy-details">
                            <summary><span>🌍 CO2 Evitat: <b style="color:white">${estalviCO2.toLocaleString(undefined, {maximumFractionDigits:1})} kg</b></span></summary>
                            <div class="analogy-content">
                                <p style="margin-bottom:10px;">↳ Feina d'absorció de <b>${arbres.toLocaleString()} arbres</b>/any.</p>
                                <div class="mini-cronograma">
                                    <p><b>Any 1:</b> Conscienciació: Transport públic ITB.</p>
                                    <p><b>Any 2:</b> Política compres km0 (Lyreco).</p>
                                    <p><b>Any 3:</b> 20% energia d'Autoconsum Solar.</p>
                                </div>
                                <div style="height: 120px; width: 100%; margin-top:10px;"><canvas id="chartCO2"></canvas></div>
                            </div>
                        </details>

                        <details class="analogy-details">
                            <summary><span>💶 Estalvi Mat/Net: <b style="color:white">${estalviEcon.toLocaleString(undefined, {maximumFractionDigits:0})} €</b></span></summary>
                            <div class="analogy-content">
                                <p style="margin-bottom:10px;">↳ Finançaria <b>${portatils} portàtils</b> nous.</p>
                                <div class="mini-cronograma">
                                    <p><b>Any 1:</b> Digitalització tràmits ('Zero Paper').</p>
                                    <p><b>Any 2:</b> Compra neteja granel (envasos retorn).</p>
                                    <p><b>Any 3:</b> Taller reparació RAEE (Economia Circular).</p>
                                </div>
                                <div style="height: 120px; width: 100%; margin-top:10px;"><canvas id="chartEcon"></canvas></div>
                            </div>
                        </details>

                    </div>
                </div>
            `;
            
            setTimeout(() => {
                generarMiniGrafic('chartAigua', tPeriode.aigua, tPeriode.aigua * 0.7);
                generarMiniGrafic('chartElec', tPeriode.elec, tPeriode.elec * 0.7);
                generarMiniGrafic('chartCO2', tPeriode.elec * 0.25, (tPeriode.elec * 0.25) * 0.7);
                generarMiniGrafic('chartEcon', tPeriode.ofi + tPeriode.neteja, (tPeriode.ofi + tPeriode.neteja) * 0.7);
            }, 100);
        }
    } else {
        if (estalviCont) estalviCont.innerHTML = "";
    }

    renderizarGraficos(tPeriode.elec * f, tPeriode.aigua * f, tPeriode.ofi * f, tPeriode.neteja * f);
}

// =========================================================
// 5. GENERADOR DE MINI-GRÀFICS (PLA 3 ANYS)
// =========================================================
function generarMiniGrafic(idCanvas, valorBase, valorOptimitzat) {
    const ctx = document.getElementById(idCanvas);
    if (!ctx) return;

    if (Chart.getChart(ctx)) {
        Chart.getChart(ctx).destroy();
    }

    const dBase = [valorBase, valorBase*1.02, valorBase*1.04, valorBase*1.06];
    const dOptim = [valorBase, valorBase*0.9, valorBase*0.8, valorOptimitzat];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Ara', 'Any 1', 'Any 2', 'Any 3'],
            datasets: [
                {
                    label: 'Sense Planificar',
                    data: dBase,
                    borderColor: 'rgba(255, 99, 132, 0.8)',
                    borderDash: [5, 5], 
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: 'Pla ASG (-30%)',
                    data: dOptim,
                    borderColor: '#00FF66',
                    backgroundColor: 'rgba(0, 255, 102, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { color: '#A3FFC2', boxWidth: 10, font: { size: 9 } } }
            },
            scales: {
                x: { ticks: { color: 'rgba(163, 255, 194, 0.6)', font: { size: 9 } }, grid: { display: false } },
                y: { ticks: { color: 'rgba(163, 255, 194, 0.6)', font: { size: 9 }, maxTicksLimit: 4 }, grid: { color: 'rgba(163, 255, 194, 0.1)' } }
            }
        }
    });
}

// =========================================================
// 6. GRÀFICS PRINCIPALS (DASHBOARD)
// =========================================================
function renderizarGraficos(elec, aigua, ofi, neteja) {
    const colorPrimario = '#00FF66';
    Chart.defaults.color = '#A3FFC2';
    Chart.defaults.font.family = "'Courier New', Courier, monospace";

    if(recursosChartInstancia) recursosChartInstancia.destroy();
    if(economicChartInstancia) economicChartInstancia.destroy();

    const ctxRecursos = document.getElementById('recursosChart');
    if(ctxRecursos) {
        recursosChartInstancia = new Chart(ctxRecursos.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Energia', 'Aigua'],
                datasets: [{ label: 'Consum', data: [elec, aigua], backgroundColor: 'rgba(0, 255, 102, 0.2)', borderColor: colorPrimario, borderWidth: 2 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const ctxEconomic = document.getElementById('economicChart');
    if(ctxEconomic) {
        economicChartInstancia = new Chart(ctxEconomic.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Oficina', 'Neteja'],
                datasets: [{ data: [ofi, neteja], backgroundColor: [colorPrimario, 'rgba(11, 219, 121, 0.5)'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
        });
    }
}