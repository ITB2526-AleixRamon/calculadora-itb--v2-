# 🌍 Calculadora de Diagnosi ASG - Fase 3 (ITB)

Aquest projecte és una aplicació web Front-End dissenyada per l'Institut Tecnològic de Barcelona (ITB). La seva funció principal és analitzar, calcular i projectar el consum de recursos del centre educatiu (Electricitat, Aigua, Material d'Oficina i Neteja) aplicant criteris ASG (Ambiental, Social i Governança) i principis d'economia circular.

## ✨ Característiques Principals

* **Hidratació de Dades Asíncrona:** Integració amb `dataclean.json` mitjançant l'API Fetch per pre-poblar els camps amb dades reals del centre (ex: fuites d'aigua nocturnes, factures trimestrals).
* **Projeccions Intel·ligents:** L'algorisme diferencia entre períodes lectius (10 mesos) i períodes d'estiu per oferir un càlcul precís de la despesa anual.
* **Simulador d'Economia Circular:** Inclou una funció per aplicar un pla de reducció del 30% a 3 anys basat en estratègies sostenibles (Zero Paper, Green Coding, polsadors temporitzats).
* **Interfície "Eco-Punk":** Disseny UI/UX avançat amb efectes de *Glassmorphism*, transicions suaus i *feedback* visual per a l'usuari.

## 🛠️ Stack Tecnològic

* **HTML5:** Estructura semàntica.
* **CSS3:** Variables natives, CSS Grid/Flexbox, animacions `@keyframes` i disseny *responsive*.
* **Vanilla JavaScript (ES6+):** Lògica de càlcul, manipulació del DOM (DOM Manipulation), funcions d'ordre superior (`reduce`, `filter`) i asincronia (`async/await`).

## 📂 Estructura del Projecte

Seguint les bones pràctiques i els requisits de la Fase 3, el projecte està modularitzat de la següent manera:

```text
📦 calculadora-itb-v2
 ┣ 📂 css
 ┃ ┗ 📜 style.css           # Fulla d'estils principal
 ┣ 📂 js
 ┃ ┗ 📜 calculadora.js      # Lògica principal de l'aplicació
 ┣ 📜 index.html            # Arxiu arrel d'estructura
 ┣ 📜 dataclean.json        # Base de dades estàtica (Data source)
 ┗ 📜 README.md             # Documentació del projecte
