let reduccioActiva = false;
let recursosChartInstancia = null;
let economicChartInstancia = null;

// =========================================================
// INICIALIZACIÓN DE DATOS (FETCH DATACLEAN.JSON)
// =========================================================
document.addEventListener("DOMContentLoaded", inicializarDadesReals);

async function inicializarDadesReals() {
    const inputs = document.querySelectorAll('.inputs input');
    
    try {
        inputs.forEach(input => input.style.opacity = '0.4');

        // Petición al JSON
        const response = await fetch('./dataclean.json');
        if (!response.ok) throw new Error('Error de xarxa en carregar el JSON');
        
        const data = await response.json();
        const factures = data.dades_recollides.factures_compres_i_manteniment;
        
        // Sumamos las facturas de Oficina (media de 3 meses)
        const totalOficina = factures
            .filter(f => f.categoria === "Material Oficina")
            .reduce((sum, f) => sum + f.import_total_eur, 0);
            
        // Sumamos las facturas de Neteja 
        const totalNeteja = factures
            .filter(f => f.categoria === "Neteja i Consumibles")
            .reduce((sum, f) => sum + f.import_total_eur, 0);

        // Inyección en el DOM
        document.getElementById('oficina').value = (totalOficina / 3).toFixed(2);
        document.getElementById('neteja').value = totalNeteja.toFixed(2);

        // Feedback visual de éxito
        inputs.forEach(input => {
            input.style.transition = 'all 0.4s ease';
            input.style.opacity = '1';
            input.style.backgroundColor = 'rgba(0, 255, 102, 0.15)';
            setTimeout(() => input.style.backgroundColor = 'rgba(0, 0, 0, 0.4)', 600);
        });

    } catch (error) {
        console.warn(">_ [ASG_WARN] Mode offline o error JSON. Utilitzant valors per defecte.", error);
        inputs.forEach(input => input.style.opacity = '1');
    }
}

// =========================================================
// LÓGICA DE CÁLCULO Y RENDERIZADO
// =========================================================
function calcular() {
    const elec = parseFloat(document.getElementById('elec').value) || 0;
    const aigua = parseFloat(document.getElementById('aigua').value) || 0;
    const ofi = parseFloat(document.getElementById('oficina').value) || 0;
    const neteja = parseFloat(document.getElementById('neteja').value) || 0;

    // Si apliquem millores ASG, tots els consums cauen un 30%
    const factor = reduccioActiva ? 0.7 : 1.0; 

    // Càlculs Anuals
    const elecAny = ((elec * 9 * 1.2) + (elec * 2 * 1.15) + (elec * 1 * 0.1)) * factor; 
    const aiguaAny = ((aigua * 10) + (aigua * 2 * 0.2)) * factor;
    const ofiAny = ((ofi * 10) + (ofi * 2) - ofi) * factor;
    const netejaAny = ((neteja * 11) + (neteja * 1.3)) * factor;

    document.getElementById('resultats').classList.remove('hidden');

    // Resumen en texto
    const etiquetaReduccio = reduccioActiva ? "<br><span style='color: #00FF66'>⚠️ Dades amb reducció ASG del 30% aplicada</span>" : "";
    document.getElementById('output-resum').innerHTML = `
        ⚡ Elec Anual: <b>${elecAny.toFixed(0)} kWh</b> | 
        💧 Aigua Anual: <b>${aiguaAny.toFixed(0)} L</b> <br>
        📎 Oficina: <b>${ofiAny.toFixed(0)} €</b> | 
        🧹 Neteja: <b>${netejaAny.toFixed(0)} €</b>
        ${etiquetaReduccio}
    `;

    renderizarGraficos(elecAny, aiguaAny, ofiAny, netejaAny);
}

function aplicarMillores() {
    reduccioActiva = true;
    // Forzamos el recalculo directo para ver la animación fluida en los gráficos
    calcular();
}

// =========================================================
// MOTOR DE GRÁFICOS (CHART.JS)
// =========================================================
function renderizarGraficos(elec, aigua, ofi, neteja) {
    const colorPrimario = '#00FF66';
    const colorFondo = 'rgba(0, 255, 102, 0.2)';

    Chart.defaults.color = '#A3FFC2'; 
    Chart.defaults.font.family = "'Courier New', Courier, monospace";

    if(recursosChartInstancia) recursosChartInstancia.destroy();
    if(economicChartInstancia) economicChartInstancia.destroy();

    // GRÁFICO 1: RECURSOS
    const ctxRecursos = document.getElementById('recursosChart').getContext('2d');
    recursosChartInstancia = new Chart(ctxRecursos, {
        type: 'bar',
        data: {
            labels: ['Elec (kWh)', 'Aigua (L)'],
            datasets: [{
                label: 'Consum Anual',
                data: [elec, aigua],
                backgroundColor: colorFondo,
                borderColor: colorPrimario,
                borderWidth: 2,
                borderRadius: 5
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // GRÁFICO 2: ECONÓMICO
    const ctxEcon = document.getElementById('economicChart').getContext('2d');
    economicChartInstancia = new Chart(ctxEcon, {
        type: 'doughnut',
        data: {
            labels: ['Oficina (€)', 'Neteja (€)'],
            datasets: [{
                data: [ofi, neteja],
                backgroundColor: [colorPrimario, 'rgba(11, 219, 121, 0.5)'],
                borderColor: '#031008',
                borderWidth: 2
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            cutout: '70%' 
        }
    });
}